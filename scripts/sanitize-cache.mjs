// Narrow remediation: redact only the exact local credential bytes from disabled,
// disposable Turbopack caches. Does not delete directories or touch source/user data.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { resolve, join, sep } from "node:path";
const root = resolve(process.cwd(), ".next", "cache", "turbopack");
const credential = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .find((line) => line.startsWith("TICKETMASTER_API_KEY="))
  ?.slice("TICKETMASTER_API_KEY=".length)
  .trim();
if (!credential) throw new Error("Local credential is missing.");
const needle = Buffer.from(credential);
let redactedFiles = 0;
function redact(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    const actual = realpathSync(path);
    if (!actual.startsWith(root + sep))
      throw new Error("Cache target is outside the verified cache root.");
    if (item.isDirectory()) {
      redact(path);
      continue;
    }
    if (!item.isFile() || !item.name.endsWith(".sst")) continue;
    const contents = readFileSync(path);
    let cursor = contents.indexOf(needle);
    if (cursor < 0) continue;
    while (cursor >= 0) {
      contents.fill(0, cursor, cursor + needle.length);
      cursor = contents.indexOf(needle, cursor + needle.length);
    }
    writeFileSync(path, contents);
    redactedFiles++;
  }
}
if (existsSync(root)) redact(root);
console.log(
  JSON.stringify({ credentialBytesRedactedFromCacheFiles: redactedFiles }),
);
