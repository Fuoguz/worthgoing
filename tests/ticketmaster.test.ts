import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { defaultPreferences } from "../src/lib/preferences";
import {
  normalizeEvent,
  normalizeResponse,
} from "../src/lib/providers/ticketmaster-normalize";
import {
  queryParameters,
  TicketmasterError,
  TicketmasterProvider,
} from "../src/lib/providers/ticketmaster";
import { searchActivities } from "../src/lib/providers/search-service";
import { evidenceConfidence } from "../src/lib/evidence";
import { scoreActivity, tagMatcher } from "../src/lib/scoring";
import { zonedToUtc } from "../src/lib/time";
import {
  ticketmasterEvent,
  ticketmasterResponse,
} from "./fixtures/ticketmaster";
import { POST } from "../src/app/api/activities/route";
const p = {
  ...defaultPreferences(),
  location: "London",
  date: "2099-07-01",
  endTime: "23:30",
  availableMinutes: 480,
  maxBudget: 100,
  maxDistanceKm: 50,
  interests: ["Live music" as const],
};
const provider = (raw: unknown = ticketmasterResponse()) =>
  new TicketmasterProvider({
    apiKey: "unit-test-placeholder",
    fetcher: vi.fn(async () => Response.json(raw)),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Ticketmaster normalization and scoring", () => {
  it("normalizes a normal activity using source facts, currency, canonical URL and classification tags", async () => {
    const a = normalizeEvent(ticketmasterEvent(), p)!;
    expect(a).toMatchObject({
      id: "ticketmaster:fixture-concert-1",
      title: "Fixture Quartet",
      date: "2099-07-01",
      startTime: "19:00",
      endTime: "21:00",
      durationMinutes: 120,
      venue: "Fixture Hall",
      city: "London",
      latitude: 51.52,
      longitude: -0.1,
      priceMin: 20,
      priceMax: 35,
      currency: "GBP",
      crowd: null,
      loud: null,
      outdoors: null,
      interests: ["Live music"],
      source: {
        name: "Ticketmaster",
        isMock: false,
        url: ticketmasterEvent().url,
        confidence: 100,
      },
    });
    expect(a.description).toBe("A fictional test concert.");
    expect(
      scoreActivity(a, p, await tagMatcher.match(a, p.interests)).verdict,
    ).toBe("Worth a trip");
  });
  it("preserves missing price as unknown, never free or over-budget", () => {
    const a = normalizeEvent(ticketmasterEvent({ priceRanges: undefined }), p)!;
    const s = scoreActivity(a, { ...p, maxBudget: 0 }, 100);
    expect(a.price).toBeNull();
    expect(a.priceMin).toBeNull();
    expect(a.priceMax).toBeNull();
    expect(a.currency).toBeNull();
    expect(s.breakdown[2].score).toBe(50);
    expect(s.blockers.join()).not.toContain("budget");
    expect(s.verdict).not.toBe("Worth a trip");
  });
  it("preserves missing venue and city without synthesizing description", () => {
    const a = normalizeEvent(
      ticketmasterEvent({ _embedded: undefined, description: undefined }),
      p,
    )!;
    expect(a.venue).toBeNull();
    expect(a.city).toBeNull();
    expect(a.description).toBeNull();
    expect(a.distanceKm).toBeNull();
    expect(a.source.confidence).toBe(75);
  });
  it("missing or invalid coordinates leave travel unknown", () => {
    const a = normalizeEvent(
      ticketmasterEvent({
        _embedded: {
          venues: [
            {
              name: "Fixture Hall",
              city: { name: "London" },
              location: { latitude: "garbage", longitude: "999" },
            },
          ],
        },
      }),
      p,
    )!;
    expect(a.latitude).toBeNull();
    expect(a.longitude).toBeNull();
    expect(a.distanceKm).toBeNull();
    expect(a.travelMinutesOneWay).toBeNull();
    expect(scoreActivity(a, p, 100).breakdown[3].score).toBe(50);
  });
  it.each(["dateTBD", "dateTBA", "timeTBA"])(
    "preserves %s and refuses precise Time Fit",
    (flag) => {
      const raw = ticketmasterEvent();
      const a = normalizeEvent(
        {
          ...raw,
          dates: { ...raw.dates, start: { ...raw.dates.start, [flag]: true } },
        },
        p,
      )!;
      expect(flag === "timeTBA" ? a.timeStatus : a.dateStatus).toBe(
        flag === "dateTBD" ? "TBD" : "TBA",
      );
      expect(scoreActivity(a, p, 100).breakdown[1].score).toBe(0);
      expect(a.source.confidence).toBeLessThan(100);
    },
  );
  it("preserves approximate start date/time and end time", () => {
    const raw = ticketmasterEvent();
    const a = normalizeEvent(
      {
        ...raw,
        dates: {
          ...raw.dates,
          start: { ...raw.dates.start, approximate: true },
          end: { ...raw.dates.end, approximate: true },
        },
      },
      p,
    )!;
    expect(a.dateStatus).toBe("approximate");
    expect(a.timeStatus).toBe("approximate");
    expect(a.endTimeStatus).toBe("approximate");
    expect(a.durationMinutes).toBeNull();
    expect(scoreActivity(a, p, 100).breakdown[1].score).toBe(0);
  });
  it("never invents duration from access/doors times or missing end", () => {
    const raw = ticketmasterEvent();
    const a = normalizeEvent(
      {
        ...raw,
        dates: {
          start: raw.dates.start,
          timezone: "Europe/London",
          access: {
            startDateTime: "2099-07-01T17:00:00Z",
            endDateTime: "2099-07-01T22:00:00Z",
          },
        },
      },
      p,
    )!;
    expect(a.durationMinutes).toBeNull();
    expect(a.endTime).toBeNull();
    const s = scoreActivity(a, p, 100);
    expect(s.breakdown[1].score).toBe(50);
    expect(s.verdict).toBe("Go if nearby");
    expect(s.uncertainties.join()).toContain("duration");
  });
  it("missing classifications preserve unknown tags and reduce evidence", async () => {
    const a = normalizeEvent(
      ticketmasterEvent({ classifications: undefined }),
      p,
    )!;
    expect(a.classifications).toEqual([]);
    expect(a.genres).toEqual([]);
    expect(a.interests).toEqual([]);
    expect(a.source.confidence).toBe(90);
    expect(await tagMatcher.match(a, p.interests)).toBe(10);
  });
  it("has deterministic additive completeness evidence", () => {
    const full = normalizeEvent(ticketmasterEvent(), p)!;
    expect(evidenceConfidence(full).score).toBe(100);
    const sparse = normalizeEvent(
      ticketmasterEvent({
        url: undefined,
        priceRanges: undefined,
        classifications: undefined,
        _embedded: undefined,
      }),
      p,
    )!;
    expect(sparse.source.confidence).toBe(35);
    expect(evidenceConfidence(sparse).score).toBe(
      evidenceConfidence(sparse).score,
    );
  });
  it("doesn't compare USD to GBP and flags a price range crossing budget", () => {
    const a = normalizeEvent(
      ticketmasterEvent({
        priceRanges: [{ min: 20, max: 80, currency: "USD" }],
      }),
      p,
    )!;
    expect(scoreActivity(a, p, 100).breakdown[2].score).toBe(50);
    expect(scoreActivity(a, p, 100).blockers).toEqual([]);
    const gbp = normalizeEvent(
      ticketmasterEvent({
        priceRanges: [{ min: 20, max: 80, currency: "GBP" }],
      }),
      p,
    )!;
    const s = scoreActivity(gbp, { ...p, maxBudget: 35 }, 100);
    expect(s.breakdown[2].score).toBe(44);
    expect(s.verdict).not.toBe("Worth a trip");
  });
  it("deduplicates IDs and canonical URLs and rejects malformed events/payloads", () => {
    const result = normalizeResponse(
      ticketmasterResponse([
        ticketmasterEvent(),
        ticketmasterEvent(),
        ticketmasterEvent({ id: "other" }),
        {},
        42,
      ]),
      p,
    );
    expect(result.activities).toHaveLength(1);
    expect(result.diagnostics).toMatchObject({
      rawCount: 5,
      duplicatesRemoved: 2,
      rejectedCount: 2,
    });
    expect(() => normalizeResponse({ oops: true }, p)).toThrow(
      "invalid response",
    );
    expect(normalizeEvent({ name: "Missing ID" }, p)).toBeNull();
  });
  it("rejects unsafe source links and never fabricates canonical URL", () => {
    const a = normalizeEvent(
      ticketmasterEvent({ url: "javascript:alert(1)" }),
      p,
    )!;
    expect(a.source.url).toBeNull();
    expect(scoreActivity(a, p, 100).verdict).not.toBe("Worth a trip");
  });
});
describe("server search and fallback", () => {
  it("keeps separate scheduled slots sharing a canonical URL", () => {
    const raw = ticketmasterEvent();
    const result = normalizeResponse(
      ticketmasterResponse([
        raw,
        {
          ...raw,
          id: "second-slot",
          dates: {
            ...raw.dates,
            start: {
              ...raw.dates.start,
              localTime: "20:00:00",
              dateTime: "2099-07-01T19:00:00Z",
            },
          },
        },
      ]),
      p,
    );
    expect(result.activities).toHaveLength(2);
    expect(result.diagnostics.duplicatesRemoved).toBe(0);
  });
  it("queries city, reliable country, UTC windows; no latlong/budget/interests", () => {
    const london = queryParameters(p);
    expect(london.get("city")).toBe("London");
    expect(london.get("countryCode")).toBe("GB");
    expect(london.get("startDateTime")).toBe("2099-07-01T11:00:00Z");
    const ny = queryParameters({ ...p, location: "New York" });
    expect(ny.get("countryCode")).toBe("US");
    expect(ny.get("startDateTime")).toBe("2099-07-01T16:00:00Z");
    const unknown = queryParameters({ ...p, location: "Paris" });
    expect(unknown.has("countryCode")).toBe(false);
    expect(unknown.get("localStartDateTime")).toContain("2099-07-01T12:00:00");
    expect(london.has("latlong")).toBe(false);
    expect(london.has("keyword")).toBe(false);
  });
  it("handles winter/summer timezone offsets and ambiguous/nonexistent DST hours", () => {
    expect(zonedToUtc("2026-01-10", "12:00", "Europe/London")).toBe(
      "2026-01-10T12:00:00Z",
    );
    expect(zonedToUtc("2026-07-10", "12:00", "America/New_York")).toBe(
      "2026-07-10T16:00:00Z",
    );
    expect(zonedToUtc("2026-01-10", "12:00", "America/New_York")).toBe(
      "2026-01-10T17:00:00Z",
    );
    expect(zonedToUtc("2026-03-29", "01:30", "Europe/London")).toBeNull();
    expect(zonedToUtc("2026-10-25", "01:30", "Europe/London")).toBeNull();
  });
  it("prefers live data, never mixes in mocks", async () => {
    const mock = { id: "fake", search: vi.fn() };
    const result = await searchActivities(p, {
      provider: provider(),
      mock,
      allowMockFallback: true,
    });
    expect(result.dataMode).toBe("live");
    expect(result.activities.every((a) => !a.source.isMock)).toBe(true);
    expect(mock.search).not.toHaveBeenCalled();
  });
  it("API failure triggers clearly labeled development fallback", async () => {
    const broken = new TicketmasterProvider({
      apiKey: "unit-test-placeholder",
      fetcher: vi.fn(
        async () => new Response("sensitive upstream body", { status: 503 }),
      ),
    });
    const result = await searchActivities(p, {
      provider: broken,
      allowMockFallback: true,
    });
    expect(result.dataMode).toBe("mock");
    expect(result.reason).toBe("api-error");
    expect(result.message).toContain("Mock data");
    expect(result.activities.every((a) => a.source.isMock)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sensitive upstream body");
  });
  it("no-results uses mock in development and live empty in production", async () => {
    const empty = provider({ page: { totalElements: 0 } });
    expect(
      (await searchActivities(p, { provider: empty, allowMockFallback: true }))
        .dataMode,
    ).toBe("mock");
    const result = await searchActivities(p, {
      provider: empty,
      allowMockFallback: false,
    });
    expect(result.activities).toEqual([]);
    expect(result.dataMode).toBe("live");
    expect(result.reason).toBe("no-results");
  });
  it("malformed responses and unusable data are distinguished safely", async () => {
    expect(
      (
        await searchActivities(p, {
          provider: provider({ bad: true }),
          allowMockFallback: true,
        })
      ).reason,
    ).toBe("malformed-response");
    expect(
      (
        await searchActivities(p, {
          provider: provider(ticketmasterResponse([{}])),
          allowMockFallback: true,
        })
      ).reason,
    ).toBe("unusable-data");
  });
  it("missing key never fetches or crashes", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    const fetcher = vi.fn();
    const result = await searchActivities(p, {
      provider: new TicketmasterProvider({ fetcher }),
      allowMockFallback: true,
    });
    expect(result.reason).toBe("missing-key");
    expect(result.dataMode).toBe("mock");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("production failure never silently serves mock data", async () => {
    const result = await searchActivities(p, {
      provider: provider({ bad: true }),
      allowMockFallback: false,
    });
    expect(result.activities).toEqual([]);
    expect(result.dataMode).toBe("unavailable");
  });
  it("bounds timeout and respects caller cancellation", async () => {
    const fetcher: typeof fetch = vi.fn(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("sensitive request URL")),
          );
        }),
    );
    const timed = new TicketmasterProvider({
      apiKey: "unit-test-placeholder",
      timeoutMs: 10,
      fetcher,
    });
    const result = await searchActivities(p, {
      provider: timed,
      allowMockFallback: true,
    });
    expect(result.reason).toBe("timeout");
    expect(JSON.stringify(result)).not.toContain("sensitive request URL");
    const controller = new AbortController();
    controller.abort();
    await expect(
      searchActivities(
        p,
        { provider: provider(), allowMockFallback: true },
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
  });
  it("never exposes fetch URLs/credentials in errors", async () => {
    const broken = new TicketmasterProvider({
      apiKey: "unit-test-placeholder",
      fetcher: vi.fn(async () => {
        throw new Error("https://example.test?apikey=unit-test-placeholder");
      }),
    });
    await expect(broken.search(p)).rejects.toEqual(
      new TicketmasterError("api-error"),
    );
  });
  it("route validates preferences, fetches on server and returns no key", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "unit-test-placeholder");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(ticketmasterResponse())),
    );
    const response = await POST(
      new Request("http://localhost/api/activities", {
        method: "POST",
        body: JSON.stringify(p),
      }),
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.dataMode).toBe("live");
    expect(JSON.stringify(result)).not.toContain("unit-test-placeholder");
    expect(
      (
        await POST(
          new Request("http://localhost/api/activities", {
            method: "POST",
            body: "bad json",
          }),
        )
      ).status,
    ).toBe(400);
  });
});
