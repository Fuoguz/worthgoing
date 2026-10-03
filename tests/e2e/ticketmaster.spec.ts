import { test, expect } from "@playwright/test";
import {
  ticketmasterEvent,
  ticketmasterResponse,
} from "../fixtures/ticketmaster";
import { normalizeResponse } from "../../src/lib/providers/ticketmaster-normalize";
import type { Preferences } from "../../src/lib/types";

test("live HTTP fixture traverses preferences, normalization, scoring, provenance and original source link", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/activities", async (route) => {
    const p = route.request().postDataJSON() as Preferences;
    const result = normalizeResponse(
      ticketmasterResponse([
        ticketmasterEvent(),
        ticketmasterEvent({
          id: "missing-fields",
          url: "https://www.ticketmaster.co.uk/event/fixture-missing",
          name: "Fixture Uncertain Event",
          priceRanges: undefined,
          _embedded: undefined,
          description: undefined,
          dates: {
            start: { localDate: p.date, timeTBA: true },
            timezone: "Europe/London",
          },
        }),
      ]),
      p,
    );
    await route.fulfill({
      json: {
        ...result,
        dataMode: "live",
        reason: null,
        message: "Live data · Ticketmaster HTTP fixture; no live API call.",
      },
    });
  });
  await page.route("https://s1.ticketm.net/**", (route) => route.abort());
  await context.route("https://www.ticketmaster.co.uk/event/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Original source fixture</h1>",
    }),
  );
  await page.goto("/");
  await page.getByLabel("Starting from").fill("London");
  await page.getByLabel("When", { exact: true }).fill("2099-07-01");
  await page.getByLabel("Until", { exact: true }).fill("23:30");
  await page.getByLabel("Activity budget").fill("100");
  await page.getByRole("button", { name: "Live music", exact: true }).click();
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.locator(".demo-notice")).toContainText(
    "Live data · Ticketmaster",
  );
  const normal = page.getByRole("article", { name: "Fixture Quartet" });
  await expect(normal).toContainText("Live data · Source: Ticketmaster");
  await expect(normal).toContainText("£20.00–£35.00 listed");
  await expect(normal).toContainText("Fixture Hall");
  await expect(normal.getByLabel(/WorthGoing Score/)).toBeVisible();
  await expect(normal.locator(".verdict-badge")).toHaveText("Worth a trip");
  const missing = page.getByRole("article", {
    name: "Fixture Uncertain Event",
  });
  await expect(missing).toContainText("Price unavailable");
  await expect(missing).toContainText("Venue unavailable");
  await expect(missing).toContainText("Time TBA");
  await expect(missing).toContainText("Distance unavailable");
  await missing.locator("summary").click();
  await expect(missing).toContainText("Planning information unavailable");
  await page.screenshot({
    path: testInfo.outputPath("live-fixture.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const popupPromise = page.waitForEvent("popup");
  await normal
    .getByRole("link", { name: "Open original Ticketmaster event" })
    .click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(ticketmasterEvent().url);
  await popup.close();
  expect(errors).toEqual([]);
});

test("production API failure and live no-results expose truthful empty states with retry", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/activities", async (route) => {
    calls++;
    await route.fulfill({
      json: {
        activities: [],
        dataMode: calls === 1 ? "unavailable" : "live",
        reason: calls === 1 ? "api-error" : "no-results",
        message:
          calls === 1
            ? "Ticketmaster unavailable."
            : "Ticketmaster returned no events.",
        diagnostics: {
          rawCount: 0,
          normalizedCount: 0,
          duplicatesRemoved: 0,
          rejectedCount: 0,
          totalAvailable: 0,
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Live search is temporarily unavailable.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry live search" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Nothing looks worth a dedicated trip right now.",
    }),
  ).toBeVisible();
});
