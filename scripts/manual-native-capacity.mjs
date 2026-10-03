import { writeFile, readFile } from "node:fs/promises";

// Standalone capacity probe: deliberately not connected to the production matcher.
const key = process.env.DEAPI_API_KEY?.trim();
if (!key) throw new Error("DEAPI_API_KEY missing; no requests made.");
const base = "https://api.deapi.ai/api/v2";
const headers = { Accept: "application/json", Authorization: `Bearer ${key}` };
const previous = JSON.parse(
  await readFile("docs/native-capacity-validation.json", "utf8").catch(
    () => "{}",
  ),
);
const report = {
  checkedAt: new Date().toISOString(),
  model: "Bge_M3_FP16",
  initialSchemaProbe: previous.initialSchemaProbe ?? previous.batches?.[0],
  batches: [],
};
const sizes = process.argv
  .slice(2)
  .filter((v) => !v.startsWith("--"))
  .map(Number);
const limits = (r) =>
  Object.fromEntries(
    [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "X-RateLimit-Daily-Limit",
      "X-RateLimit-Daily-Remaining",
      "Retry-After",
    ].map((n) => {
      const v = r.headers.get(n);
      return [n, v && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null];
    }),
  );
const shape = (v, depth = 0) => {
  if (Array.isArray(v))
    return {
      type: "array",
      length: v.length,
      item: depth < 4 ? shape(v[0], depth + 1) : typeof v[0],
    };
  if (v && typeof v === "object")
    return depth < 4
      ? Object.fromEntries(
          Object.entries(v)
            .slice(0, 20)
            .map(([k, x]) => [k, shape(x, depth + 1)]),
        )
      : "object";
  return typeof v;
};
for (const size of sizes.length ? sizes : [2, 10, 14, 25, 51]) {
  const started = performance.now();
  const row = {
    texts: size,
    accepted: false,
    completed: false,
    requestId: null,
    embeddingCount: null,
    dimensions: [],
    polls: [],
    rateLimited: false,
  };
  const signal = AbortSignal.timeout(90000);
  try {
    const resume = size === 2 && process.argv.includes("--resume-first");
    const response = resume
      ? Response.json({
          data: { request_id: report.initialSchemaProbe.requestId },
        })
      : await fetch(`${base}/embeddings`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: report.model,
            input: Array.from({ length: size }, (_, i) => `urban art ${i}`),
            return_result_in_response: true,
          }),
          signal,
          redirect: "error",
        });
    row.httpStatus = response.status;
    row.submitLatencyMs = Math.round(performance.now() - started);
    row.limits = limits(response);
    if (resume) {
      row.recoveredExistingJob = true;
      row.submitLatencyMs = report.initialSchemaProbe.submitLatencyMs;
      row.limits = report.initialSchemaProbe.limits;
    }
    row.rateLimited = response.status === 429;
    const raw = await response.json();
    row.submitShape = shape(raw);
    if (!response.ok)
      row.publicError =
        typeof raw.message === "string"
          ? raw.message.replaceAll(key, "[redacted]").slice(0, 300)
          : null;
    if (
      response.ok &&
      typeof raw.data?.request_id === "string" &&
      /^[a-zA-Z0-9-]{1,100}$/.test(raw.data.request_id)
    ) {
      row.accepted = true;
      row.requestId = raw.data.request_id;
      for (let poll = 0; poll < 45; poll++) {
        const r = await fetch(`${base}/jobs/${row.requestId}`, {
          headers,
          signal,
          redirect: "error",
        });
        const job = await r.json();
        const status =
          typeof job.data?.status === "string"
            ? job.data.status.replaceAll(key, "[redacted]").slice(0, 40)
            : null;
        row.polls.push({ httpStatus: r.status, status, limits: limits(r) });
        row.rateLimited ||= r.status === 429;
        row.jobShape = shape(job);
        if (!r.ok || ["failed", "cancelled", "canceled"].includes(status))
          break;
        if (status === "done" || status === "completed") {
          row.completed = true;
          row.resultShape = shape(job.data.result);
          // Extract only a shape-confirmed vector matrix; never persist vectors or signed URLs.
          let result = job.data.result;
          if (typeof result === "string" && !result.startsWith("https://"))
            result = JSON.parse(result);
          if (typeof result === "string") {
            const url = new URL(result);
            if (
              url.protocol !== "https:" ||
              url.hostname !== "results.deapi.ai" ||
              url.username ||
              url.password
            )
              throw new Error("Unexpected result host");
            const downloaded = await fetch(url, { signal, redirect: "error" }); // Never forward Authorization to the result host.
            row.downloadHttpStatus = downloaded.status;
            if (!downloaded.ok) throw new Error("Result download failed");
            result = await downloaded.json();
            row.downloadShape = shape(result);
          }
          const matrix = Array.isArray(result) ? result : result?.embeddings;
          if (Array.isArray(matrix)) {
            row.embeddingCount = matrix.length;
            row.dimensions = [
              ...new Set(
                matrix.map((v) => (Array.isArray(v) ? v.length : null)),
              ),
            ];
            row.validVectors = matrix.every(
              (v) =>
                Array.isArray(v) &&
                v.length === 1024 &&
                v.every((n) => typeof n === "number" && Number.isFinite(n)) &&
                Math.hypot(...v) > 0,
            );
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  } catch {
    row.error = signal.aborted ? "timeout" : "request-or-json-failure";
  }
  row.totalCompletionLatencyMs = Math.round(performance.now() - started);
  report.batches.push(row);
  await writeFile(
    "docs/native-capacity-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      ...row,
      polls: row.polls.map((p) => ({
        httpStatus: p.httpStatus,
        status: p.status,
      })),
    }),
  );
}
