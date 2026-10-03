// Explicit real production verification. No upstream requests are mocked here.
import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const url = process.argv[2];
if (!url || !url.startsWith("https://"))
  throw new Error("Production HTTPS URL required.");
const secrets = [
  process.env.TICKETMASTER_API_KEY,
  process.env.DEAPI_API_KEY,
].filter(Boolean);
const safe = (text) =>
  secrets.reduce((result, key) => result.replaceAll(key, "[redacted]"), text);
const browser = await chromium.launch({
  ...(process.env.HTTPS_PROXY
    ? {
        proxy: {
          server: process.env.HTTPS_PROXY,
          bypass: "localhost,127.0.0.1",
        },
      }
    : {}),
});
const report = {
  checkedAt: new Date().toISOString(),
  productionUrl: url,
  queryDate: "2026-10-10",
  queries: [],
};
await mkdir("docs/production-validation", { recursive: true });
try {
  for (const [name, city, interest, mobile] of [
    ["london-music", "London", "live music", false],
    ["new-york-sports", "New York", "sports", false],
    ["london-chinese-mobile", "London", "城市探索、建筑、艺术展览", true],
  ]) {
    const context = await browser.newContext(
      mobile
        ? { ...devices["iPhone 13"], defaultBrowserType: undefined }
        : { viewport: { width: 1440, height: 1000 } },
    );
    const page = await context.newPage();
    const pageErrors = [],
      upstream = [];
    page.on("pageerror", (e) => pageErrors.push(safe(e.message)));
    page.on("request", (r) => {
      if (
        /^https:\/\/(api\.deapi\.ai|oai\.deapi\.ai|app\.ticketmaster\.com)\//.test(
          r.url(),
        )
      )
        upstream.push("unexpected-client-upstream-request");
    });
    const landing = await page.goto(url);
    await page
      .getByRole("heading", { name: "What’s worth leaving home for?" })
      .waitFor();
    const landingOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await page.screenshot({
      path: `docs/production-validation/${name}-landing.png`,
    });
    await page.getByLabel("Starting from").fill(city);
    await page.getByLabel("When", { exact: true }).fill(report.queryDate);
    await page.getByLabel("From", { exact: true }).fill("12:00");
    await page.getByLabel("Until", { exact: true }).fill("23:30");
    await page.getByLabel("Time to spare").selectOption("480");
    await page.getByLabel("Activity budget").fill("100");
    await page.getByLabel("Travel radius").fill("50");
    const selected = page.locator('button[aria-pressed="true"]');
    while (await selected.count()) await selected.first().click();
    await page.getByLabel("Describe your interests").fill(interest);
    await page.screenshot({
      path: `docs/production-validation/${name}-preferences.png`,
    });
    const started = performance.now();
    const reply = page.waitForResponse(
      (r) => r.url().endsWith("/api/activities"),
      { timeout: 100000 },
    );
    await page.getByRole("button", { name: "Find what’s worth it" }).click();
    const loadingVisible = await page
      .getByRole("status", { name: "Weighing your options" })
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (loadingVisible)
      await page.screenshot({
        path: `docs/production-validation/${name}-loading.png`,
      });
    const response = await reply;
    const data = await response.json();
    const responseLatencyMs = Math.round(performance.now() - started);
    const activities = data.activities ?? [];
    if (activities.length) await page.getByRole("article").first().waitFor();
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
    let breakdownVisible = false,
      sourceCheck = null;
    if (cards.length) {
      const card = page.getByRole("article").first();
      await card.locator("summary").click();
      breakdownVisible = await card
        .getByText("Interest Fit", { exact: true })
        .isVisible();
      await page.screenshot({
        path: `docs/production-validation/${name}-breakdown.png`,
      });
      await card.locator("summary").click();
      const link = card.getByRole("link", {
        name: "Open original Ticketmaster event",
      });
      const expectedUrl = await link.getAttribute("href");
      const popupReply = page.waitForEvent("popup");
      await link.click();
      const popup = await popupReply;
      let sourceStatus = null;
      popup.on("response", (r) => {
        if (
          r.request().isNavigationRequest() &&
          r.frame() === popup.mainFrame()
        )
          sourceStatus = r.status();
      });
      // A newly created popup can still have about:blank's completed load state.
      // Navigate explicitly so blank content is never reported as verified.
      const sourceResponse = await popup
        .goto(expectedUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
        .catch(() => null);
      sourceStatus = sourceResponse?.status() ?? sourceStatus;
      sourceCheck = {
        expectedUrl,
        openedUrl: popup.url(),
        httpStatus: sourceStatus,
        title: safe(await popup.title().catch(() => "")),
        bodyPreview: safe(
          (
            await popup
              .locator("body")
              .innerText({ timeout: 5000 })
              .catch(() => "")
          ).slice(0, 700),
        ),
      };
      await popup
        .screenshot({ path: `docs/production-validation/${name}-source.png` })
        .catch(() => {});
      await popup.close();
    }
    // Wait a bounded interval for image success/failure states before the layout capture.
    await page
      .waitForFunction(
        () => [...document.images].every((img) => img.complete),
        { timeout: 5000 },
      )
      .catch(() => {});
    await page.screenshot({
      path: `docs/production-validation/${name}-results.png`,
      fullPage: true,
    });
    const row = {
      name,
      city,
      interest,
      mobileViewport: mobile,
      landingHttpStatus: landing?.status(),
      apiHttpStatus: response.status(),
      responseLatencyMs,
      loadingVisible,
      dataMode: data.dataMode,
      error: data.error ? safe(data.error) : null,
      ticketmaster: data.diagnostics,
      semantic: data.interestDiagnostics,
      sourceNames: [...new Set(activities.map((a) => a.source.name))],
      mockCount: activities.filter((a) => a.source.isMock).length,
      fallbackReasons: [
        ...new Set(
          activities.map((a) => a.interestMatch?.reason).filter(Boolean),
        ),
      ],
      shown: cards.length,
      cards,
      breakdownVisible,
      sourceCheck,
      landingOverflow,
      resultsOverflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      pageErrors,
      browserCalledUpstream: upstream.length > 0,
    };
    report.queries.push(row);
    await writeFile(
      "docs/production-smoke.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(row));
    await context.close();
  }
} finally {
  await browser.close();
}
