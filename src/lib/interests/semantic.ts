import "server-only";
import type {
  Activity,
  Preferences,
  InterestMatcher,
  InterestMatch,
  InterestSearchDiagnostics,
  InterestFallbackReason,
  SearchResult,
} from "../types";
import { tagMatcher } from "../scoring";
import {
  DeapiEmbeddingClient,
  EmbeddingError,
  DEAPI_MODEL,
  EMBEDDING_DIMENSIONS,
} from "./deapi";
import { eventInterestText, userInterestText } from "./text";
import {
  cosineSimilarity,
  INTEREST_MAPPING_ID,
  similarityToInterestFit,
} from "./similarity";

export class EmbeddingCache {
  private entries = new Map<string, { vector: number[]; expires: number }>();
  constructor(
    private ttlMs = 300000,
    private maxEntries = 1000,
    private now = Date.now,
  ) {}
  get(text: string): number[] | null {
    const key = this.key(text),
      item = this.entries.get(key);
    if (!item) return null;
    if (item.expires <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, item);
    return item.vector;
  }
  set(text: string, vector: number[]) {
    const key = this.key(text);
    this.entries.delete(key);
    this.entries.set(key, { vector, expires: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries)
      this.entries.delete(this.entries.keys().next().value!);
  }
  key(text: string) {
    return `${DEAPI_MODEL}\n${text.normalize("NFC").replaceAll("\r\n", "\n").trim()}`;
  }
}

export class SemanticInterestMatcher implements InterestMatcher {
  constructor(
    private client = new DeapiEmbeddingClient(),
    private cache = new EmbeddingCache(),
  ) {}
  async match(a: Activity, interests: Preferences["interests"]) {
    return (await this.matchBatch([a], { interests })).matches[0].score;
  }
  async matchBatch(
    activities: Activity[],
    p: Pick<Preferences, "interests" | "interestText">,
    signal?: AbortSignal,
  ): Promise<{
    matches: InterestMatch[];
    diagnostics: InterestSearchDiagnostics;
  }> {
    const started = performance.now();
    const diagnostics: InterestSearchDiagnostics = {
      model: DEAPI_MODEL,
      requestCount: 0,
      inputCount: 0,
      cacheHits: 0,
      latencyMs: 0,
      semanticCount: 0,
      fallbackCount: 0,
    };
    const matches: InterestMatch[] = await Promise.all(
      activities.map(async (a) => ({
        mode: "keyword-fallback" as const,
        score: await tagMatcher.match(a, p.interests),
        similarity: null,
        model: null,
        dimensions: null,
        mapping: null,
        reason: a.source.isMock
          ? ("mock-data" as const)
          : ("missing-metadata" as const),
      })),
    );
    const texts = activities.map(eventInterestText);
    const user = userInterestText(p);
    const eligible = texts.some(Boolean);
    if (eligible) {
      let failure: InterestFallbackReason | null = null;
      const all = [user, ...texts.filter((text): text is string => !!text)];
      const unique = [
        ...new Map(all.map((t) => [this.cache.key(t), t])).values(),
      ];
      const vectors = new Map<string, number[]>();
      const failures = new Map<string, InterestFallbackReason>();
      try {
        // Missing/revoked configuration must not be hidden by cached vectors.
        if (!this.client.configured()) throw new EmbeddingError("missing-key");
        const pending = unique.filter((text) => {
          const cached = this.cache.get(text);
          if (cached) {
            vectors.set(this.cache.key(text), cached);
            diagnostics.cacheHits++;
            return false;
          }
          return true;
        });
        if (pending.length > 100)
          throw new EmbeddingError("malformed-response");
        if (pending.length) {
          diagnostics.requestCount = 1;
          diagnostics.inputCount = pending.length;
          const result = await this.client.embed(pending, signal);
          Object.assign(diagnostics, result.metrics);
          pending.forEach((text, i) => {
            const key = this.cache.key(text),
              vector = result.vectors[i];
            if (vector) {
              vectors.set(key, vector);
              this.cache.set(text, vector);
            } else failures.set(key, result.reasons[i] ?? "invalid-vector");
          });
        }
      } catch (error) {
        if (signal?.aborted)
          throw new DOMException("Request aborted", "AbortError");
        failure = error instanceof EmbeddingError ? error.reason : "http-error";
      }
      const userVector = vectors.get(this.cache.key(user));
      texts.forEach((text, index) => {
        if (!text) return;
        const eventVector = vectors.get(this.cache.key(text));
        const reason =
          failure ??
          failures.get(this.cache.key(user)) ??
          failures.get(this.cache.key(text));
        const similarity =
          !reason && userVector && eventVector
            ? cosineSimilarity(userVector, eventVector)
            : null;
        if (similarity == null) {
          matches[index].reason = reason ?? "invalid-vector";
          return;
        }
        matches[index] = {
          mode: "semantic",
          score: similarityToInterestFit(similarity),
          similarity,
          model: DEAPI_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          mapping: INTEREST_MAPPING_ID,
          reason: null,
        };
      });
    }
    diagnostics.semanticCount = matches.filter(
      (m) => m.mode === "semantic",
    ).length;
    diagnostics.fallbackCount = matches.length - diagnostics.semanticCount;
    diagnostics.latencyMs = Math.round(performance.now() - started);
    return { matches, diagnostics };
  }
}
const semanticMatcher = new SemanticInterestMatcher();
export async function matchSearchInterests(
  result: SearchResult,
  p: Preferences,
  signal?: AbortSignal,
  matcher = semanticMatcher,
): Promise<SearchResult> {
  const { matches, diagnostics } = await matcher.matchBatch(
    result.activities,
    p,
    signal,
  );
  return {
    ...result,
    activities: result.activities.map((a, i) => ({
      ...a,
      interestMatch: matches[i],
    })),
    interestDiagnostics: diagnostics,
  };
}
