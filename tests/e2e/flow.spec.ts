import { test, expect } from "@playwright/test";
import { mockProvider } from "../../src/lib/providers/mock";
import type { Preferences } from "../../src/lib/types";

// Existing MVP flows stay fixture-driven; automated tests never call live Ticketmaster.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/activities", async (route) => {
    const p = route.request().postDataJSON() as Preferences;
    const activities = await mockProvider.search(p);
    await route.fulfill({
      json: {
        activities,
        dataMode: "mock",
        reason: "no-results",
        message: "Mock data · Automated fixture, not live listings.",
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
});

test("primary flow, sources, breakdown, filters and preference persistence", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What’s worth leaving home for?" }),
  ).toBeVisible();
  await expect(page.getByLabel("Starting from")).toHaveValue(
    "Shoreditch, London",
  );
  await page.screenshot({
    path: testInfo.outputPath("landing.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(
    page.getByRole("status", { name: "Weighing your options" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByText(/plans earn the trip/)).toBeVisible();
  const card = page.getByRole("article").first();
  await expect(
    card.getByLabel(/WorthGoing Score \d+ out of 100/),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: /venue website/ }),
  ).toHaveAttribute("href", /^https:\/\//);
  await card.locator("summary").click();
  await expect(card.getByText("Interest Fit", { exact: true })).toBeVisible();
  await expect(card.getByText(/35% weight/)).toBeVisible();
  await card.locator("summary").click();
  await page.screenshot({
    path: testInfo.outputPath("results.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Worth a trip/ }).click();
  await expect(page.getByRole("article")).toHaveCount(4);
  await page.getByRole("button", { name: /^All options/ }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(5);
  await page.getByRole("link", { name: "Edit preferences" }).click();
  await expect(page.getByLabel("Activity budget")).toHaveValue("35");
  await expect(
    page.getByRole("button", { name: "Art & culture", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("tight constraints deliver the negative recommendation, including filter empty state", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Time to spare").selectOption("30");
  await page.getByLabel("Activity budget").fill("0");
  await page.getByLabel("Travel radius").fill("0.5");
  await page.getByRole("button", { name: "Crowds", exact: true }).click();
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Nothing looks worth a dedicated trip right now.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.locator(".verdict-badge.skip")).toHaveCount(5);
  await page.screenshot({
    path: testInfo.outputPath("negative.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /^Worth a trip/ }).click();
  await expect(
    page.getByText("No options have this verdict for your day."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all options" }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
});

test("unsupported locations produce a useful empty state", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Starting from").fill("Paris");
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(
    page.getByRole("heading", { name: "We haven’t explored here yet." }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("link", { name: "Change location" }).click();
  await expect(page.getByLabel("Starting from")).toHaveValue("Paris");
});

test("invalid windows and no interests are explained before navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("From", { exact: true }).fill("22:00");
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "End time must be after start time",
  );
  await page.getByLabel("From", { exact: true }).fill("12:00");
  for (const interest of ["Art & culture", "Food & drink", "Nature"])
    await page.getByRole("button", { name: interest, exact: true }).click();
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Choose at least one interest",
  );
});

test("direct results without saved data and corrupt storage recover", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("worthgoing.preferences.v1", "bad-json"),
  );
  await page.goto("/results");
  await expect(
    page.getByRole("heading", { name: "Let’s start with your day." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Find a plan", exact: true }).click();
  await expect(page.getByLabel("Starting from")).toHaveValue(
    "Shoreditch, London",
  );
});

test("blocked storage retains preferences during client navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  await page.goto("/");
  await expect(page.getByText(/browser can’t save preferences/)).toBeVisible();
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByText(/browser can’t save preferences/)).toBeVisible();
});
