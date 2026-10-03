import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  DeapiEmbeddingClient,
  DEAPI_ENDPOINT,
  DEAPI_MODEL,
  EMBEDDING_DIMENSIONS,
  EmbeddingError,
  parseEmbeddingResponse,
} from "../src/lib/interests/deapi";
import {
  EmbeddingCache,
  SemanticInterestMatcher,
  matchSearchInterests,
} from "../src/lib/interests/semantic";
import {
  cosineSimilarity,
  INTEREST_ANCHORS,
  similarityToInterestFit,
} from "../src/lib/interests/similarity";
import { userInterestText, eventInterestText } from "../src/lib/interests/text";
import { normalizeEvent } from "../src/lib/providers/ticketmaster-normalize";
import {
  ticketmasterEvent,
  ticketmasterResponse,
} from "./fixtures/ticketmaster";
import {
  defaultPreferences,
  parsePreferences,
  validatePreferences,
} from "../src/lib/preferences";
import {
  providedInterestMatcher,
  rankActivities,
  tagMatcher,
  scoreActivity,
} from "../src/lib/scoring";
import { WEIGHTS, type SearchResult } from "../src/lib/types";
import { POST } from "../src/app/api/activities/route";
import calibration from "../docs/deapi-calibration.json";

const p = {
  ...defaultPreferences(),
  date: "2099-07-01",
  location: "London",
  maxBudget: 100,
  maxDistanceKm: 50,
  availableMinutes: 480,
  endTime: "23:30",
  interests: ["Live music" as const],
};
const activity = () => normalizeEvent(ticketmasterEvent(), p)!;
const vector = (x = 1, y = 0) => [
  x,
  y,
  ...Array(EMBEDDING_DIMENSIONS - 2).fill(0),
];
const response = (vectors: unknown[]) => ({
  object: "list",
  model: DEAPI_MODEL,
  data: vectors.map((embedding, index) => ({ index, embedding })),
});
const key = "unit-test-placeholder";
// Retain the original indexed vector fixtures and assertions while adapting
// their mock HTTP transport to native submit -> done -> encoded matrix.
const nativeFixture = (fixture: typeof fetch): typeof fetch => {
  let result: unknown;
  return async (url, init) => {
    if (init?.method === "POST") {
      const reply = await fixture(url, init);
      if (!reply.ok) return reply;
      const raw = await reply.json();
      result = Array.isArray(raw?.data)
        ? raw.data.map((r: { embedding: unknown }) => r.embedding)
        : raw;
      return Response.json({ data: { request_id: "fixture-job" } });
    }
    return Response.json({
      data: { status: "done", result: JSON.stringify(result) },
    });
  };
};
const client = (raw: unknown = response([vector(), vector()])) =>
  new DeapiEmbeddingClient({
    apiKey: key,
    fetcher: nativeFixture(vi.fn(async () => Response.json(raw))),
  });
const search = (activities = [activity()]): SearchResult => ({
  activities,
  dataMode: "live",
  reason: null,
  message: "HTTP fixture",
  diagnostics: {
    rawCount: activities.length,
    normalizedCount: activities.length,
    duplicatesRemoved: 0,
    rejectedCount: 0,
    totalAvailable: activities.length,
  },
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("BGE-M3 parsing and cosine", () => {
  it("measured low and medium cases are not inflated, including cross-language examples", () => {
    const fits = Object.fromEntries(
      calibration.cases.map((c) => [
        c.id,
        similarityToInterestFit(c.similarity),
      ]),
    );
    expect(fits.C).toBe(0);
    expect(fits.E).toBe(0);
    expect(fits["step8-medium"]).toBeLessThanOrEqual(55);
    expect(fits.D).toBeGreaterThan(fits["step8-medium"]);
    expect(fits.A).toBeGreaterThan(fits["step8-medium"]);
    expect(fits.B).toBeGreaterThan(fits["step8-medium"]);
  });
  it("parses 1024 floats and uses response indices rather than response order", () => {
    const raw = response([vector(2), vector(0, 3)]);
    raw.data.reverse();
    expect(parseEmbeddingResponse(raw, 2).vectors).toEqual([
      vector(2),
      vector(0, 3),
    ]);
  });
  it("computes cosine without assuming normalization", () =>
    expect(cosineSimilarity([3, 0], [6, 6])).toBeCloseTo(Math.SQRT1_2));
  it("identical vectors have similarity one", () =>
    expect(cosineSimilarity([3, 4], [3, 4])).toBeCloseTo(1));
  it("unrelated and opposite vectors have zero and negative similarity", () => {
    expect(cosineSimilarity([1, 0], [0, 2])).toBe(0);
    expect(cosineSimilarity([1, 0], [-2, 0])).toBe(-1);
  });
  it.each([
    { value: [0, 0] },
    { value: [NaN, 1] },
    { value: [Infinity, 1] },
    { value: [] },
  ])("invalid vector %j does not throw", ({ value }) =>
    expect(cosineSimilarity(value, [1, 1])).toBeNull(),
  );
  it("dimension mismatch returns null", () =>
    expect(cosineSimilarity([1], [1, 0])).toBeNull());
  it("marks one invalid vector without invalidating healthy rows", () => {
    expect(
      parseEmbeddingResponse(response([vector(), vector(0, 0)]), 2).reasons,
    ).toEqual([null, "invalid-vector"]);
    expect(
      parseEmbeddingResponse(response([vector(), [1, 2]]), 2).reasons[1],
    ).toBe("dimension-mismatch");
    expect(
      parseEmbeddingResponse(response(["base64 string"]), 1).reasons[0],
    ).toBe("invalid-vector");
  });
  it.each([
    { data: [] },
    {
      data: [
        { index: 0, embedding: vector() },
        { index: 0, embedding: vector() },
      ],
    },
    { data: [{ embedding: vector() }] },
    null,
  ])("malformed response rejects safely", (raw) =>
    expect(() => parseEmbeddingResponse(raw, 2)).toThrow(EmbeddingError),
  );
  it("piecewise mapping is clamped, monotonic and transparent at every anchor", () => {
    expect(similarityToInterestFit(-1)).toBe(0);
    expect(similarityToInterestFit(1)).toBe(100);
    for (const [cosine, fit] of INTEREST_ANCHORS)
      expect(similarityToInterestFit(cosine)).toBe(fit);
    let previous = 0;
    for (let n = -100; n <= 100; n++) {
      const fit = similarityToInterestFit(n / 100);
      expect(fit).toBeGreaterThanOrEqual(previous);
      previous = fit;
    }
    expect(similarityToInterestFit(NaN)).toBe(0);
  });
});
describe("texts, privacy, batch and cache", () => {
  it("preserves multilingual natural language without translation", () => {
    const text = "城市探索、建筑、艺术展览";
    expect(userInterestText({ interests: [], interestText: text })).toBe(
      `User interests:\n${text}`,
    );
    expect(
      userInterestText({
        interests: ["Film", "Nature"],
        interestText: "architecture",
      }),
    ).toBe("User interests:\nFilm; Nature\narchitecture");
    expect(
      validatePreferences({ ...p, interests: [], interestText: text }),
    ).toBeNull();
    expect(
      parsePreferences(
        JSON.stringify({ ...p, interests: [], interestText: text }),
        false,
      )?.interestText,
    ).toBe(text);
    expect(
      parsePreferences(JSON.stringify({ ...p, interestText: 42 }), false),
    ).toBeNull();
    expect(
      validatePreferences({ ...p, interestText: "a".repeat(1001) }),
    ).toContain("1,000");
  });
  it("builds event text only from source metadata, preserves taxonomy, omits missing fields", () => {
    const a = activity();
    a.interests = ["Nature"];
    a.tradeOff = "invented extra keywords";
    a.venue = null;
    a.city = null;
    const text = eventInterestText(a)!;
    expect(text).toContain("Title: Fixture Quartet");
    expect(text).toContain("Segment: Music");
    expect(text).not.toContain("Venue:");
    expect(text).not.toContain("City:");
    expect(text).not.toContain("Nature");
    expect(text).not.toContain(a.tradeOff);
    expect(
      eventInterestText({ ...a, source: { ...a.source, isMock: true } }),
    ).toBeNull();
  });
  it("performs one batch, deduplicates texts, caches valid embeddings and forwards only interests/public metadata", async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      return Response.json(response(body.input.map(() => vector())));
    });
    const matcher = new SemanticInterestMatcher(
      new DeapiEmbeddingClient({
        apiKey: key,
        fetcher: nativeFixture(fetcher),
      }),
    );
    const a = activity();
    const repeated = { ...a, id: "distinct-occurrence" };
    const result = await matcher.matchBatch([a, repeated], {
      ...p,
      interestText: "城市探索",
    });
    expect(
      result.matches.every((m) => m.mode === "semantic" && m.score === 100),
    ).toBe(true);
    expect(result.diagnostics).toMatchObject({
      requestCount: 1,
      inputCount: 2,
      semanticCount: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(DEAPI_ENDPOINT);
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" });
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${key}`,
    );
    const body = JSON.parse(init!.body as string);
    expect(Object.keys(body).sort()).toEqual([
      "input",
      "model",
      "return_result_in_response",
    ]);
    expect(body.input).toHaveLength(2);
    expect(body.input[0]).toContain("城市探索");
    expect(JSON.stringify(body)).not.toContain(key);
    expect(JSON.stringify(body)).not.toContain(
      p.maxBudget.toString() + " budget",
    );
    const again = await matcher.matchBatch([a], p);
    expect(again.diagnostics.requestCount).toBe(1); // changed user text, event cached
    const same = await matcher.matchBatch([a], p);
    expect(same.diagnostics).toMatchObject({ requestCount: 0, cacheHits: 2 });
  });
  it("uses the configured opaque native token unchanged and never sends keys in input", async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      expect(body.input[0]).not.toContain(key);
      expect((init!.headers as Record<string, string>).Authorization).toBe(
        `Bearer dpn-sk-${key}`,
      );
      return Response.json(response([vector()]));
    });
    await new DeapiEmbeddingClient({
      apiKey: `dpn-sk-${key}`,
      fetcher: nativeFixture(fetcher),
    }).embed([`user text dpn-sk-${key}`]);
  });
  it("cache TTL, NFC keys and capacity are bounded", () => {
    let now = 100;
    const cache = new EmbeddingCache(20, 2, () => now);
    cache.set("e\u0301", vector());
    expect(cache.get("é")).not.toBeNull();
    cache.set("b", vector());
    cache.set("c", vector());
    expect(cache.get("é")).toBeNull();
    now = 121;
    expect(cache.get("b")).toBeNull();
  });
});
describe("semantic fit and keyword fallback", () => {
  it("provides semantic inputs to the original weighted engine and changes no other components", async () => {
    const a = activity();
    const result = await matchSearchInterests(
      search([a]),
      p,
      undefined,
      new SemanticInterestMatcher(client()),
    );
    const scored = (
      await rankActivities(result.activities, p, providedInterestMatcher)
    )[0];
    const old = scoreActivity(a, p, 100);
    expect(scored.breakdown.slice(1)).toEqual(old.breakdown.slice(1));
    expect(scored.breakdown.map((b) => b.weight)).toEqual([35, 20, 15, 15, 15]);
    expect(WEIGHTS["Interest Fit"]).toBe(35);
    expect(scored.breakdown[0].score).toBe(100);
    expect(scored.breakdown[0].explanation).toContain(
      "Semantic interest match powered by deAPI",
    );
    expect(scored.verdict).toBe(old.verdict);
    expect(scored.score).toBe(old.score);
    expect(JSON.stringify(result)).not.toContain("embedding");
  });
  it.each([401, 403, 429, 500, 503])(
    "HTTP %i immediately falls back without losing results",
    async (status) => {
      const fetcher = vi.fn(
        async () => new Response("upstream sensitive body", { status }),
      );
      const result = await new SemanticInterestMatcher(
        new DeapiEmbeddingClient({ apiKey: key, fetcher }),
      ).matchBatch([activity()], p);
      expect(result.matches[0].mode).toBe("keyword-fallback");
      expect(result.matches[0].score).toBe(
        await tagMatcher.match(activity(), p.interests),
      );
      expect(result.matches[0].reason).toBe(
        [401, 403].includes(status)
          ? "unauthorized"
          : status === 429
            ? "rate-limit"
            : "http-error",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain("upstream sensitive body");
    },
  );
  it("missing key never calls HTTP, even with populated cache", async () => {
    vi.stubEnv("DEAPI_API_KEY", "");
    const fetcher = vi.fn();
    const result = await new SemanticInterestMatcher(
      new DeapiEmbeddingClient({ fetcher }),
    ).matchBatch([activity()], p);
    expect(result.matches[0].reason).toBe("missing-key");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("timeout falls back and cancellation remains cancellation", async () => {
    const fetcher: typeof fetch = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("sensitive header")),
          );
        }),
    );
    const matcher = new SemanticInterestMatcher(
      new DeapiEmbeddingClient({ apiKey: key, fetcher, timeoutMs: 10 }),
    );
    expect((await matcher.matchBatch([activity()], p)).matches[0].reason).toBe(
      "timeout",
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      matcher.matchBatch([activity()], p, controller.signal),
    ).rejects.toThrow("aborted");
  });
  it.each([null, { data: [] }, { model: "wrong-model", data: [] }, "not JSON"])(
    "malformed embeddings use keyword fallback",
    async (raw) => {
      const result = await new SemanticInterestMatcher(client(raw)).matchBatch(
        [activity()],
        p,
      );
      expect(result.matches[0].reason).toBe("malformed-response");
    },
  );
  it("one invalid event embedding falls back only for that event", async () => {
    const other = { ...activity(), id: "other", title: "Different title" };
    const result = await new SemanticInterestMatcher(
      client(response([vector(), vector(), vector(0, 0)])),
    ).matchBatch([activity(), other], p);
    expect(result.matches.map((m) => m.mode)).toEqual([
      "semantic",
      "keyword-fallback",
    ]);
    expect(result.matches[1].reason).toBe("invalid-vector");
  });
  it("user dimension mismatch falls back for all candidates", async () => {
    const result = await new SemanticInterestMatcher(
      client(response([[1, 2], vector()])),
    ).matchBatch([activity()], p);
    expect(result.matches[0].reason).toBe("dimension-mismatch");
  });
  it("mock activities never reach deAPI", async () => {
    const fetcher = vi.fn();
    const a = activity();
    a.source.isMock = true;
    const result = await new SemanticInterestMatcher(
      new DeapiEmbeddingClient({ apiKey: key, fetcher }),
    ).matchBatch([a], p);
    expect(result.matches[0].reason).toBe("mock-data");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("route survives deAPI failure while Ticketmaster still works, no key is returned", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "ticketmaster-test-placeholder");
    vi.stubEnv("DEAPI_API_KEY", key);
    const fetcher = vi.fn(async (url: unknown) =>
      String(url).startsWith(DEAPI_ENDPOINT)
        ? new Response("secret upstream error", { status: 503 })
        : Response.json(ticketmasterResponse()),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await (
      await POST(
        new Request("http://localhost/api/activities", {
          method: "POST",
          body: JSON.stringify(p),
        }),
      )
    ).json();
    expect(result.dataMode).toBe("live");
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].interestMatch.mode).toBe("keyword-fallback");
    expect(result.interestDiagnostics.fallbackCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("secret upstream error");
  });
});
