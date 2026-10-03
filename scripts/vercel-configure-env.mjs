// Deployment-only helper. Run with --env-file=.env.local; credentials use stdin,
// never command-line arguments or unfiltered CLI output.
import { spawnSync } from "node:child_process";
const cliPath = process.argv[2];
if (!cliPath) throw new Error("Vercel CLI path required.");
const names = ["TICKETMASTER_API_KEY", "DEAPI_API_KEY"];
const secrets = names.map((name) => process.env[name]?.trim());
if (secrets.some((value) => !value))
  throw new Error("Required server configuration missing.");
for (const name of names) {
  const result = spawnSync(
    process.execPath,
    [
      "--use-env-proxy",
      cliPath,
      "env",
      "add",
      name,
      "production,preview",
      "--sensitive",
      "--yes",
      "--scope",
      "fuoguzs-projects",
    ],
    { input: process.env[name].trim(), encoding: "utf8", timeout: 90000 },
  );
  const safeOutput = secrets.reduce(
    (text, secret) => text.replaceAll(secret, "[redacted]"),
    `${result.stdout ?? ""}${result.stderr ?? ""}`,
  );
  console.log(safeOutput);
  if (result.status !== 0) {
    console.error(`Configuration failed for ${name}.`);
    process.exit(1);
  }
}
