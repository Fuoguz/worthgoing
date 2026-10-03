// Explicit manual verification only. Not included in npm test or test:e2e.
// The browser never receives the Ticketmaster key: it exercises /api/activities.
import { chromium, devices } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const proxy = env
  .split(/\r?\n/)
  .find((line) => line.startsWith("HTTPS_PROXY="))
  ?.slice("HTTPS_PROXY=".length);
const browser = await chromium.launch({
  ...(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {}),
});
mkdirSync("docs/validation", { recursive: true });
const results = [];
for (const city of ["London", "New York"]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  const clientRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => clientRequests.push(request.url()));
  await page.goto("http://127.0.0.1:3000/");
  await page.getByLabel("Starting from").fill(city);
  await page.getByLabel("When", { exact: true }).fill("2026-10-10");
  await page.getByLabel("Until", { exact: true }).fill("23:30");
  await page.getByLabel("Time to spare").selectOption("480");
  await page.getByLabel("Activity budget").fill("100");
  await page.getByLabel("Travel radius").fill("50");
  for (const tag of ["Food & drink", "Nature"])
    await page.getByRole("button", { name: tag, exact: true }).click();
  await page.getByRole("button", { name: "Live music", exact: true }).click();
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/activities"),
  );
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  const response = await responsePromise;
  const data = await response.json();
  await page
    .getByRole("heading", { name: "A few ways to spend it well." })
    .waitFor();
  if (data.activities?.length)
    await page.getByRole("article").first().waitFor();
  const activities = data.activities ?? [];
  const shown = await page.getByRole("article").count();
  const coverage = {
    priceRanges: activities.filter((a) => a.priceRanges?.length).length,
    venue: activities.filter((a) => a.venue).length,
    coordinates: activities.filter(
      (a) => a.latitude != null && a.longitude != null,
    ).length,
    classifications: activities.filter((a) => a.classifications?.length).length,
    genres: activities.filter((a) => a.genres?.length).length,
    description: activities.filter((a) => a.description).length,
    duration: activities.filter((a) => a.durationMinutes != null).length,
    timezone: activities.filter((a) => a.timezone).length,
    dateTBD: activities.filter((a) => a.dateStatus === "TBD").length,
    dateTBA: activities.filter((a) => a.dateStatus === "TBA").length,
    timeTBA: activities.filter((a) => a.timeStatus === "TBA").length,
    approximate: activities.filter(
      (a) =>
        a.dateStatus === "approximate" ||
        a.timeStatus === "approximate" ||
        a.endTimeStatus === "approximate",
    ).length,
  };
  const cards = await page
    .getByRole("article")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        title: node.getAttribute("aria-label"),
        score: node.querySelector(".score-number")?.getAttribute("aria-label"),
        verdict: node.querySelector(".verdict-badge")?.textContent,
        source: node.querySelector(".card-source a")?.getAttribute("href"),
      })),
    );
  await page.screenshot({
    path: `docs/validation/${city.toLowerCase().replaceAll(" ", "-")}-desktop.png`,
    fullPage: true,
  });
  let sourceCheck = null;
  if (shown) {
    const link = page
      .getByRole("article")
      .first()
      .getByRole("link", { name: "Open original Ticketmaster event" });
    const expectedUrl = await link.getAttribute("href");
    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;
    let sourceStatus = null;
    popup.on("response", (r) => {
      if (r.request().isNavigationRequest() && r.frame() === popup.mainFrame())
        sourceStatus = r.status();
    });
    try {
      await popup.waitForLoadState("domcontentloaded", { timeout: 25000 });
    } catch {}
    const title = await popup.title().catch(() => "");
    const body = (
      await popup
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(0, 600);
    sourceCheck = {
      expectedUrl,
      openedUrl: popup.url(),
      status: sourceStatus,
      title,
      bodyPreview: body,
    };
    await popup
      .screenshot({
        path: `docs/validation/${city.toLowerCase().replaceAll(" ", "-")}-source.png`,
      })
      .catch(() => {});
    await popup.close();
  }
  const result = {
    city,
    queryDate: "2026-10-10",
    window: "12:00–23:30 event-local",
    dataMode: data.dataMode,
    reason: data.reason,
    diagnostics: data.diagnostics,
    shown,
    coverage,
    cards,
    sourceCheck,
    uniqueIds: new Set(activities.map((a) => a.id)).size,
    sourceUrls: new Set(activities.map((a) => a.source.url).filter(Boolean))
      .size,
    clientCalledDiscoveryDirectly: clientRequests.some((url) =>
      url.startsWith("https://app.ticketmaster.com/"),
    ),
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    pageErrors: errors,
  };
  console.log(JSON.stringify(result));
  results.push(result);
  await context.close();
}
const mobileContext = await browser.newContext({
  ...devices["iPhone 13"],
  defaultBrowserType: undefined,
});
const mobilePage = await mobileContext.newPage();
await mobilePage.goto("http://127.0.0.1:3000/");
await mobilePage.getByLabel("Starting from").fill("New York");
await mobilePage.getByLabel("When", { exact: true }).fill("2026-10-10");
await mobilePage.getByLabel("Until", { exact: true }).fill("23:30");
const mobileResponse = mobilePage.waitForResponse((response) =>
  response.url().endsWith("/api/activities"),
);
await mobilePage.getByRole("button", { name: "Find what’s worth it" }).click();
const mobileData = await (await mobileResponse).json();
if (mobileData.activities?.length)
  await mobilePage.getByRole("article").first().waitFor();
await mobilePage.screenshot({
  path: "docs/validation/new-york-mobile.png",
  fullPage: true,
});
const mobile = {
  city: "New York",
  dataMode: mobileData.dataMode,
  shown: await mobilePage.getByRole("article").count(),
  horizontalOverflow: await mobilePage.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  ),
};
console.log(JSON.stringify({ mobile }));
writeFileSync(
  "docs/live-query-validation.json",
  JSON.stringify({ desktop: results, mobile }, null, 2) + "\n",
);
await browser.close();
