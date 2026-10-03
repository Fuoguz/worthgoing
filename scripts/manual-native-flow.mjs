// Explicit real API browser verification, excluded from automated tests.
import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const proxy = process.env.HTTPS_PROXY;
const browser = await chromium.launch({
  ...(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {}),
});
await mkdir("docs/native-validation", { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  queryDate: "2026-10-10",
  window: "12:00–23:30 local",
  queries: [],
};
const interests = [
  ["sports", "football, baseball, live sports"],
  ["music", "live music, jazz and soul concerts"],
  ["art", "art exhibitions, architecture and museums"],
  ["chinese", "城市探索、建筑、艺术展览"],
];
try {
  for (const city of ["London", "New York"]) {
    const mobile = city === "New York";
    const context = await browser.newContext(
      mobile
        ? { ...devices["iPhone 13"], defaultBrowserType: undefined }
        : { viewport: { width: 1440, height: 1000 } },
    );
    const page = await context.newPage();
    const pageErrors = [],
      requests = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    for (const [category, text] of interests) {
      await page.goto("http://127.0.0.1:3000/");
      await page.getByLabel("Starting from").fill(city);
      await page.getByLabel("When", { exact: true }).fill(report.queryDate);
      await page.getByLabel("From", { exact: true }).fill("12:00");
      await page.getByLabel("Until", { exact: true }).fill("23:30");
      await page.getByLabel("Time to spare").selectOption("480");
      await page.getByLabel("Activity budget").fill("100");
      await page.getByLabel("Travel radius").fill("50");
      const selected = page.locator('button[aria-pressed="true"]');
      while (await selected.count()) await selected.first().click();
      await page.getByLabel("Describe your interests").fill(text);
      const started = performance.now();
      const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith("/api/activities"),
        { timeout: 90000 },
      );
      await page.getByRole("button", { name: "Find what’s worth it" }).click();
      const response = await responsePromise;
      const data = await response.json();
      await page
        .getByRole("heading", { name: "A few ways to spend it well." })
        .waitFor();
      if (data.activities?.length)
        await page.getByRole("article").first().waitFor();
      const cards = await page
        .getByRole("article")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            title: n.getAttribute("aria-label"),
            score: n.querySelector(".score-number")?.getAttribute("aria-label"),
            verdict: n.querySelector(".verdict-badge")?.textContent,
            sourceUrl: n.querySelector(".card-source a")?.getAttribute("href"),
          })),
        );
      const activities = data.activities ?? [];
      const row = {
        city,
        device: mobile ? "mobile Chromium" : "desktop Chromium",
        category,
        interest: text,
        httpStatus: response.status(),
        dataMode: data.dataMode,
        ticketmaster: data.diagnostics,
        semantic: data.interestDiagnostics,
        userFlowLatencyMs: Math.round(performance.now() - started),
        shown: cards.length,
        uniqueIds: new Set(activities.map((a) => a.id)).size,
        fallbackReasons: [
          ...new Set(
            activities.map((a) => a.interestMatch?.reason).filter(Boolean),
          ),
        ],
        cards,
        candidateFits: activities.map((a) => ({
          id: a.id,
          title: a.title,
          fit: a.interestMatch?.score,
          similarity: a.interestMatch?.similarity,
          mode: a.interestMatch?.mode,
        })),
        horizontalOverflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        pageErrors: [...pageErrors],
        browserCalledUpstream: requests.some(
          (u) =>
            u.startsWith("https://api.deapi.ai/") ||
            u.startsWith("https://oai.deapi.ai/") ||
            u.startsWith("https://app.ticketmaster.com/"),
        ),
      };
      await page.screenshot({
        path: `docs/native-validation/${city.toLowerCase().replaceAll(" ", "-")}-${category}.png`,
        fullPage: true,
      });
      report.queries.push(row);
      await writeFile(
        "docs/native-live-flow.json",
        JSON.stringify(report, null, 2) + "\n",
      );
      console.log(JSON.stringify({ ...row, candidateFits: undefined }));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
