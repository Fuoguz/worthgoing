// Read-only scan of anonymously accessible HTML, JS/CSS and optional API records.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const base = new URL(process.argv[2]);
const keys = [
  process.env.TICKETMASTER_API_KEY,
  process.env.DEAPI_API_KEY,
].filter(Boolean);
if (keys.length !== 2)
  throw new Error("Two local credentials required for scanning.");
const secrets = keys.map((key) => Buffer.from(key));
const findings = [],
  visited = new Set(),
  pending = [base.href, new URL("results", base).href];
let clientAssets = 0;
while (pending.length) {
  const url = pending.shift();
  if (visited.has(url)) continue;
  visited.add(url);
  const reply = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!reply.ok) throw new Error("Public asset scan failed.");
  const bytes = Buffer.from(await reply.arrayBuffer());
  if (secrets.some((secret) => bytes.includes(secret)))
    findings.push("public-asset-contains-credential");
  const text = bytes.toString("utf8");
  if (reply.headers.get("content-type")?.includes("text/html")) {
    for (const match of text.matchAll(
      /(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g,
    )) {
      const asset = new URL(match[1].replaceAll("&amp;", "&"), base);
      if (asset.origin === base.origin) pending.push(asset.href);
    }
  } else clientAssets++;
}
const tracked = execFileSync("git", ["ls-files", "-z"])
  .toString()
  .split("\0")
  .filter(Boolean);
for (const path of tracked) {
  const bytes = await readFile(path);
  if (secrets.some((secret) => bytes.includes(secret))) findings.push(path);
}
const record = {
  checkedAt: new Date().toISOString(),
  productionUrl: base.href,
  publicResourcesScanned: visited.size,
  publicClientAssets: clientAssets,
  gitTrackedFilesScanned: tracked.length,
  localEnvTracked: tracked.includes(".env.local"),
  findings,
};
if (!process.argv.includes("--no-write")) {
  await writeFile(
    "docs/production-secret-scan.json",
    JSON.stringify(record, null, 2) + "\n",
  );
}
console.log(JSON.stringify(record));
if (findings.length || record.localEnvTracked || !clientAssets) process.exit(1);
