import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  DeapiEmbeddingClient,
  DEAPI_ENDPOINT,
  DEAPI_JOBS_ENDPOINT,
  parseNativeResult,
} from "../src/lib/interests/deapi";
import { SemanticInterestMatcher } from "../src/lib/interests/semantic";
import { defaultPreferences } from "../src/lib/preferences";
import { normalizeEvent } from "../src/lib/providers/ticketmaster-normalize";
import { ticketmasterEvent } from "./fixtures/ticketmaster";
import { tagMatcher } from "../src/lib/scoring";
const vector = () => [1, ...Array(1023).fill(0)];
const submit = () => Response.json({ data: { request_id: "native-test-job" } });
const done = () =>
  Response.json({
    data: { status: "done", result: JSON.stringify([vector(), vector()]) },
  });
const client = (fetcher: typeof fetch, extra = {}) =>
  new DeapiEmbeddingClient({
    apiKey: "native-test-token",
    fetcher,
    pollIntervalMs: 0,
    ...extra,
  });

describe("native async batch transport", () => {
  it("submits one batch, polls pending and processing, stops immediately at done", async () => {
    const replies = [
      submit(),
      Response.json({ data: { status: "pending" } }),
      Response.json({ data: { status: "processing" } }),
      done(),
    ];
    const fetcher = vi.fn(async () => replies.shift()!);
    const result = await client(fetcher).embed(["one", "two"]);
    expect(result.vectors).toEqual([vector(), vector()]);
    expect(result.metrics).toMatchObject({ httpRequestCount: 4, pollCount: 3 });
    expect(fetcher.mock.calls).toHaveLength(4);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      DEAPI_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer native-test-token",
          Accept: "application/json",
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${DEAPI_JOBS_ENDPOINT}/native-test-job`,
      expect.objectContaining({ method: "GET" }),
    );
  });
  it("handles a task that is already done on its first poll", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(done());
    expect(
      (await client(fetcher).embed(["one", "two"])).metrics.pollCount,
    ).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["failed", "cancelled", "canceled"])(
    "%s job falls back without exposing upstream errors",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(submit())
        .mockResolvedValueOnce(
          Response.json({
            data: { status, error_reason: "sensitive upstream text" },
          }),
        );
      await expect(client(fetcher).embed(["one", "two"])).rejects.toMatchObject(
        {
          reason: "job-failed",
          message: "Semantic matching unavailable (job-failed).",
        },
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it("bounds pending polling independently of the wall clock timeout", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockImplementation(async () =>
        Response.json({ data: { status: "pending" } }),
      );
    await expect(
      client(fetcher, { maxPolls: 2 }).embed(["one", "two"]),
    ).rejects.toMatchObject({ reason: "timeout" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("timeout interrupts the polling interval", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValue(Response.json({ data: { status: "pending" } }));
    await expect(
      client(fetcher, { timeoutMs: 10, pollIntervalMs: 1000 }).embed([
        "one",
        "two",
      ]),
    ).rejects.toMatchObject({ reason: "timeout" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("poll 429 stops without retrying or resubmitting", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "60", "X-RateLimit-Limit": "50" },
        }),
      );
    await expect(client(fetcher).embed(["one", "two"])).rejects.toMatchObject({
      reason: "rate-limit",
      limits: { limit: 50, retryAfterSeconds: 60 },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    {},
    { data: null },
    { data: { status: "unexpected" } },
    { data: { status: "done", result: "not JSON" } },
  ])("malformed job response is rejected", async (raw) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(Response.json(raw));
    await expect(client(fetcher).embed(["one", "two"])).rejects.toMatchObject({
      reason: "malformed-response",
    });
  });
  it("rejects malformed submit IDs without ever following an injected URL", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: { request_id: "https://invalid.test/credential" },
      }),
    );
    await expect(client(fetcher).embed(["one", "two"])).rejects.toMatchObject({
      reason: "malformed-response",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a result URL rather than forwarding authorization elsewhere", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(
        Response.json({
          data: { status: "done", result: "https://invalid.test/result" },
        }),
      );
    await expect(client(fetcher).embed(["one", "two"])).rejects.toMatchObject({
      reason: "malformed-response",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("checks native matrix count, dimensions and invalid vectors", () => {
    expect(() => parseNativeResult(JSON.stringify([vector()]), 2)).toThrow();
    expect(
      parseNativeResult(JSON.stringify([vector(), [1, 2]]), 2).reasons,
    ).toEqual([null, "dimension-mismatch"]);
    expect(
      parseNativeResult([vector(), Array(1024).fill(0)], 2).reasons,
    ).toEqual([null, "invalid-vector"]);
  });
  it("combines partially cached vectors with a new user batch without changing activity correspondence", async () => {
    const p = {
      ...defaultPreferences(),
      date: "2099-07-01",
      location: "London",
      interestText: "first user",
    };
    const a = normalizeEvent(ticketmasterEvent(), p)!;
    const b = { ...a, id: "second", title: "Another activity" };
    let matrix: number[][] = [];
    const orthogonal = [0, 1, ...Array(1022).fill(0)];
    const fetcher = vi.fn(async (_url, init) => {
      if (init?.method === "POST") {
        const input = JSON.parse(init.body as string).input;
        matrix =
          input.length === 3 ? [vector(), vector(), orthogonal] : [orthogonal];
        return submit();
      }
      return Response.json({
        data: { status: "done", result: JSON.stringify(matrix) },
      });
    });
    const matcher = new SemanticInterestMatcher(client(fetcher));
    expect(
      (await matcher.matchBatch([a, b], p)).matches.map((m) => m.score),
    ).toEqual([100, 0]);
    const changed = { ...p, interestText: "second user" };
    const partial = await matcher.matchBatch([a, b], changed);
    expect(partial.diagnostics).toMatchObject({
      inputCount: 1,
      cacheHits: 2,
      requestCount: 1,
    });
    expect(partial.matches.map((m) => m.score)).toEqual([0, 100]);
    const cached = await matcher.matchBatch([a, b], changed);
    expect(cached.diagnostics).toMatchObject({
      inputCount: 0,
      cacheHits: 3,
      requestCount: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(4); // Two POSTs, two GETs; full cache adds none.
  });
  it("a failed native job leaves the original keyword scores and live activities usable", async () => {
    const p = {
      ...defaultPreferences(),
      date: "2099-07-01",
      location: "London",
    };
    const a = normalizeEvent(ticketmasterEvent(), p)!;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockResolvedValueOnce(Response.json({ data: { status: "failed" } }));
    const result = await new SemanticInterestMatcher(
      client(fetcher),
    ).matchBatch([a], p);
    expect(result.matches[0]).toMatchObject({
      mode: "keyword-fallback",
      score: await tagMatcher.match(a, p.interests),
      reason: "job-failed",
    });
    expect(result.diagnostics).toMatchObject({
      semanticCount: 0,
      fallbackCount: 1,
    });
  });
  it("caller cancellation interrupts polling and stays cancellation", async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(submit())
      .mockImplementation(async () => {
        setTimeout(() => controller.abort(), 1);
        return Response.json({ data: { status: "pending" } });
      });
    await expect(
      client(fetcher, { pollIntervalMs: 1000 }).embed(
        ["one", "two"],
        controller.signal,
      ),
    ).rejects.toThrow("aborted");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
