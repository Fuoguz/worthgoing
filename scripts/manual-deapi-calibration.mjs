// Explicit small live check. Never included in npm test or browser tests.
// Run with Node's env file, environment proxy, react-server condition and TS transform.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import {
  DeapiEmbeddingClient,
  DEAPI_ENDPOINT,
  DEAPI_MODEL,
} from "../src/lib/interests/deapi.ts";
import {
  cosineSimilarity,
  similarityToInterestFit,
  INTEREST_ANCHORS,
} from "../src/lib/interests/similarity.ts";
const cases = [
  {
    id: "A",
    kind: "high",
    user: "technology, immersive experiences",
    event: "Technology and interactive digital art exhibition",
  },
  {
    id: "B",
    kind: "high",
    user: "architecture, urban exploration",
    event: "Architecture and city design exhibition",
  },
  {
    id: "C",
    kind: "low",
    user: "architecture and museums",
    event: "Premier League football match",
  },
  {
    id: "D",
    kind: "cross-language-high",
    user: "城市探索、建筑、艺术展览",
    event: "Architecture and urban art exhibition",
  },
  {
    id: "E",
    kind: "cross-language-low",
    user: "科技和互动展览",
    event: "Baseball game",
  },
  {
    id: "step8-high",
    kind: "high",
    user: "architecture, urban exploration, exhibitions",
    event: "Architecture exhibition, Arts & Theatre",
  },
  {
    id: "step8-medium",
    kind: "medium",
    user: "technology and interactive exhibitions",
    event: "Science museum event",
  },
];
// Literal supplied pairs: these are controlled examples, not claimed Ticketmaster facts.
const selectedIds = process.argv
  .find((v) => v.startsWith("--cases="))
  ?.slice(8)
  .split(",");
const selected = selectedIds
  ? cases.filter((c) => selectedIds.includes(c.id))
  : cases;
const input = [...new Set(selected.flatMap((c) => [c.user, c.event]))];
const started = performance.now();
try {
  const result = await new DeapiEmbeddingClient({ timeoutMs: 60000 }).embed(
    input,
  );
  const latencyMs = Math.round(performance.now() - started);
  const records = selected.map((c) => {
    const user = result.vectors[input.indexOf(c.user)],
      event = result.vectors[input.indexOf(c.event)];
    const similarity = user && event ? cosineSimilarity(user, event) : null;
    return {
      ...c,
      similarity,
      interestFit:
        similarity == null ? null : similarityToInterestFit(similarity),
      dimensions: { user: user?.length ?? null, event: event?.length ?? null },
    };
  });
  const previous = existsSync("docs/deapi-calibration.json")
    ? JSON.parse(readFileSync("docs/deapi-calibration.json", "utf8"))
    : null;
  const merged = new Map((previous?.cases ?? []).map((c) => [c.id, c]));
  records.forEach((c) =>
    merged.set(c.id, { ...c, measuredBatchLatencyMs: latencyMs }),
  );
  const report = {
    endpoint: DEAPI_ENDPOINT,
    model: DEAPI_MODEL,
    requestCount: (previous?.requestCount ?? 0) + 1,
    inputCount: (previous?.inputCount ?? 0) + input.length,
    latencyMs,
    anchors: INTEREST_ANCHORS,
    cases: [...merged.values()],
    scope:
      "Exact controlled examples provided by the user; not live event facts. No embedding vectors persisted.",
  };
  writeFileSync(
    "docs/deapi-calibration.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      status: "unavailable",
      reason: error.reason ?? "unknown",
      limits: error.limits,
      latencyMs: Math.round(performance.now() - started),
    }),
  );
  process.exitCode = 1;
}
