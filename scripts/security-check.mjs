import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const env = readFileSync(join(root, ".env.local"), "utf8");
const keyNames = ["TICKETMASTER_API_KEY", "DEAPI_API_KEY"];
const keys = keyNames.map((name) =>
  env
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2"),
);
if (keys.some((key) => !key)) {
  console.log("Security check: local key is missing.");
  process.exit(1);
}
const secrets = keys.map((key) => Buffer.from(key));
const findings = [];
let scanned = 0;
let clientFiles = 0;
function scan(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      scan(path);
      continue;
    }
    if (relative(root, path) === ".env.local") continue;
    scanned++;
    if (path.includes(join(".next", "static"))) clientFiles++;
    const contents = readFileSync(path);
    if (secrets.some((secret) => contents.includes(secret)))
      findings.push(relative(root, path));
  }
}
scan(root);
let gitTracked =
  "No Git repository exists in this workspace; no file is Git-tracked.";
try {
  const tracked = execFileSync(
    "git",
    ["ls-files", "--error-unmatch", ".env.local"],
    { cwd: root, stdio: ["ignore", "pipe", "ignore"] },
  ).toString();
  if (tracked.trim()) {
    gitTracked = "FAIL: .env.local is tracked";
    findings.push(".env.local tracked by Git");
  }
} catch {
  if (existsSync(join(root, ".git")))
    gitTracked = ".env.local is not Git-tracked.";
}
const ignore = readFileSync(join(root, ".gitignore"), "utf8");
const ignoreConfigured = [".env.local", ".env*.local"].every((pattern) =>
  ignore.split(/\r?\n/).includes(pattern),
);
const exampleClean =
  readFileSync(join(root, ".env.example"), "utf8").trim() ===
  "TICKETMASTER_API_KEY=\nDEAPI_API_KEY=";
console.log(
  JSON.stringify(
    {
      scanned,
      checkedCredentials: keyNames,
      clientFiles,
      secretOutsideLocalEnv: findings,
      ignoreConfigured,
      exampleClean,
      gitTracked,
      clientSecretCheck:
        clientFiles > 0 &&
        findings.filter(
          (path) =>
            path.startsWith(".next\\static") || path.startsWith(".next/static"),
        ).length === 0
          ? "passed"
          : "unverified",
    },
    null,
    2,
  ),
);
if (findings.length || !ignoreConfigured || !exampleClean) process.exitCode = 1;
