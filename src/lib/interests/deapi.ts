import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import type { InterestFallbackReason } from "../types";
export const DEAPI_ENDPOINT = "https://api.deapi.ai/api/v2/embeddings";
export const DEAPI_JOBS_ENDPOINT = "https://api.deapi.ai/api/v2/jobs";
export const DEAPI_MODEL = "Bge_M3_FP16";
export const EMBEDDING_DIMENSIONS = 1024;
export class EmbeddingError extends Error {
  constructor(
    public reason: InterestFallbackReason,
    public limits?: {
      limit: number | null;
      remaining: number | null;
      reset: number | null;
      retryAfterSeconds: number | null;
    },
  ) {
    super(`Semantic matching unavailable (${reason}).`);
  }
}
export function parseEmbeddingResponse(
  raw: unknown,
  count: number,
): {
  vectors: (number[] | null)[];
  reasons: (InterestFallbackReason | null)[];
} {
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (
    !Array.isArray(data.data) ||
    data.data.length !== count ||
    (data.model !== undefined && data.model !== DEAPI_MODEL)
  )
    throw new EmbeddingError("malformed-response");
  const vectors: (number[] | null)[] = Array(count).fill(null);
  const reasons: (InterestFallbackReason | null)[] = Array(count).fill(null);
  const indices = new Set<number>();
  for (const row of data.data) {
    if (
      !row ||
      typeof row !== "object" ||
      !Number.isInteger(row.index) ||
      row.index < 0 ||
      row.index >= count ||
      indices.has(row.index)
    )
      throw new EmbeddingError("malformed-response");
    indices.add(row.index);
    const v: unknown = row.embedding;
    const invalid =
      !Array.isArray(v) ||
      !v.every((n) => typeof n === "number" && Number.isFinite(n));
    const reason = invalid
      ? "invalid-vector"
      : v.length !== EMBEDDING_DIMENSIONS
        ? "dimension-mismatch"
        : !Math.hypot(...v) || !Number.isFinite(Math.hypot(...v))
          ? "invalid-vector"
          : null;
    reasons[row.index] = reason;
    if (!reason) vectors[row.index] = v as number[];
  }
  return { vectors, reasons };
}
/** Native jobs return an ordered matrix encoded as JSON in data.result. */
export function parseNativeResult(raw: unknown, count: number) {
  let matrix: unknown;
  try {
    matrix = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new EmbeddingError("malformed-response");
  }
  if (!Array.isArray(matrix)) throw new EmbeddingError("malformed-response");
  return parseEmbeddingResponse(
    { data: matrix.map((embedding, index) => ({ embedding, index })) },
    count,
  );
}
export class DeapiEmbeddingClient {
  constructor(
    private options: {
      apiKey?: string;
      fetcher?: typeof fetch;
      timeoutMs?: number;
      pollIntervalMs?: number;
      maxPolls?: number;
    } = {},
  ) {}
  configured() {
    return !!(this.options.apiKey ?? process.env.DEAPI_API_KEY)?.trim();
  }
  async embed(input: string[], signal?: AbortSignal) {
    if (signal?.aborted)
      throw new DOMException("Request aborted", "AbortError");
    const key = (this.options.apiKey ?? process.env.DEAPI_API_KEY)?.trim();
    if (!key) throw new EmbeddingError("missing-key");
    if (!input.length || input.length > 100)
      throw new EmbeddingError("malformed-response");
    // Never forward credentials accidentally included in interest/source text.
    const secrets = [
      key,
      `dpn-sk-${key}`,
      process.env.TICKETMASTER_API_KEY,
    ].filter((v): v is string => !!v);
    const safeInput = input.map((text) =>
      secrets.reduce(
        (clean, secret) => clean.replaceAll(secret, "[credential removed]"),
        text,
      ),
    );
    const started = performance.now();
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 60000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      let httpRequestCount = 0;
      const request = async (url: string, body?: unknown) => {
        httpRequestCount++;
        const response = await (this.options.fetcher ?? fetch)(url, {
          method: body ? "POST" : "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: requestSignal,
          cache: "no-store",
          redirect: "error",
        });
        if (!response.ok) {
          const numberHeader = (name: string) => {
            const value = response.headers.get(name);
            return value && /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
          };
          throw new EmbeddingError(
            [401, 403].includes(response.status)
              ? "unauthorized"
              : response.status === 429
                ? "rate-limit"
                : "http-error",
            {
              limit: numberHeader("X-RateLimit-Limit"),
              remaining: numberHeader("X-RateLimit-Remaining"),
              reset: numberHeader("X-RateLimit-Reset"),
              retryAfterSeconds: numberHeader("Retry-After"),
            },
          );
        }
        const raw: unknown = await response.json();
        if (requestSignal.aborted) throw new EmbeddingError("timeout");
        return raw && typeof raw === "object"
          ? (raw as { data?: Record<string, unknown> }).data
          : undefined;
      };
      const submission = await request(DEAPI_ENDPOINT, {
        model: DEAPI_MODEL,
        input: safeInput,
        return_result_in_response: true,
      });
      const submitLatencyMs = Math.round(performance.now() - started);
      const id = submission?.request_id;
      if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
        throw new EmbeddingError("malformed-response");
      for (let poll = 0; poll < (this.options.maxPolls ?? 20); poll++) {
        const job = await request(`${DEAPI_JOBS_ENDPOINT}/${id}`);
        const status = job?.status;
        if (status === "done" || status === "completed") {
          const result = parseNativeResult(job?.result, input.length);
          return {
            ...result,
            metrics: {
              submitLatencyMs,
              completionLatencyMs: Math.round(performance.now() - started),
              httpRequestCount,
              pollCount: poll + 1,
            },
          };
        }
        if (
          ["failed", "cancelled", "canceled", "error"].includes(String(status))
        )
          throw new EmbeddingError("job-failed");
        if (!["pending", "processing", "queued"].includes(String(status)))
          throw new EmbeddingError("malformed-response");
        if (poll + 1 < (this.options.maxPolls ?? 20))
          await delay(this.options.pollIntervalMs ?? 3000, undefined, {
            signal: requestSignal,
          });
      }
      throw new EmbeddingError("timeout");
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Request aborted", "AbortError");
      if (timeout.aborted) throw new EmbeddingError("timeout");
      if (error instanceof EmbeddingError) throw error;
      if (error instanceof SyntaxError)
        throw new EmbeddingError("malformed-response");
      // Raw network errors, response bodies and headers may contain secrets.
      throw new EmbeddingError("http-error");
    }
  }
}
