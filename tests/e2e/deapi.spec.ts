import { test, expect } from "@playwright/test";
import { normalizeResponse } from "../../src/lib/providers/ticketmaster-normalize";
import {
  ticketmasterEvent,
  ticketmasterResponse,
} from "../fixtures/ticketmaster";
import { tagMatcher } from "../../src/lib/scoring";
import { INTEREST_MAPPING_ID } from "../../src/lib/interests/similarity";
import type { Preferences } from "../../src/lib/types";

test("multilingual freeform interests traverse semantic score, ordering, breakdown and persistence", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("https://s1.ticketm.net/**", (route) => route.abort());
  await page.route("**/api/activities", async (route) => {
    const p = route.request().postDataJSON() as Preferences;
    expect(p.interestText).toBe("城市探索、建筑、艺术展览");
    expect(p.interests).toEqual([]);
    const data = normalizeResponse(
      ticketmasterResponse([
        ticketmasterEvent({ id: "semantic-low", name: "Low semantic fixture" }),
        ticketmasterEvent({
          id: "semantic-high",
          name: "High semantic fixture",
          url: "https://www.ticketmaster.co.uk/event/fixture-high",
        }),
      ]),
      p,
    );
    await route.fulfill({
      json: {
        ...data,
        dataMode: "live",
        reason: null,
        message: "Live HTTP fixtures, mock embeddings.",
        activities: data.activities.map((a, i) => ({
          ...a,
          interestMatch: {
            mode: "semantic",
            score: i === 0 ? 0 : 100,
            similarity: i === 0 ? 0 : 1,
            model: "Bge_M3_FP16",
            dimensions: 1024,
            mapping: INTEREST_MAPPING_ID,
            reason: null,
          },
        })),
      },
    });
  });
  await page.goto("/");
  for (const name of ["Art & culture", "Food & drink", "Nature"])
    await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByLabel("Describe your interests")
    .fill("城市探索、建筑、艺术展览");
  await page.getByLabel("Starting from").fill("London");
  await page.getByLabel("When", { exact: true }).fill("2099-07-01");
  await page.getByLabel("Until", { exact: true }).fill("23:30");
  await page.getByLabel("Activity budget").fill("100");
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  const first = page.getByRole("article").first();
  await expect(first).toHaveAttribute("aria-label", "High semantic fixture");
  await first.locator("summary").click();
  await expect(first).toContainText("Semantic interest match powered by deAPI");
  await expect(first).toContainText("35% weight · 100/100");
  await expect(first).toContainText("Live data · Source: Ticketmaster");
  await page
    .getByRole("link", { name: "Edit preferences", exact: true })
    .click();
  await expect(page.getByLabel("Describe your interests")).toHaveValue(
    "城市探索、建筑、艺术展览",
  );
  await page.reload();
  await expect(page.getByLabel("Describe your interests")).toHaveValue(
    "城市探索、建筑、艺术展览",
  );
  expect(
    requests.some(
      (url) =>
        url.startsWith("https://oai.deapi.ai/") ||
        url.startsWith("https://app.ticketmaster.com/"),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("deAPI failure falls back to keyword scores and keeps usable results without an error", async ({
  page,
}) => {
  await page.route("https://s1.ticketm.net/**", (route) => route.abort());
  await page.route("**/api/activities", async (route) => {
    const p = route.request().postDataJSON() as Preferences;
    const data = normalizeResponse(ticketmasterResponse(), p);
    const activities = await Promise.all(
      data.activities.map(async (a) => ({
        ...a,
        interestMatch: {
          mode: "keyword-fallback",
          score: await tagMatcher.match(a, p.interests),
          similarity: null,
          model: null,
          dimensions: null,
          mapping: null,
          reason: "rate-limit",
        },
      })),
    );
    await route.fulfill({
      json: {
        ...data,
        activities,
        dataMode: "live",
        reason: null,
        message: "Live HTTP fixture with keyword fallback.",
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Starting from").fill("London");
  await page.getByLabel("When", { exact: true }).fill("2099-07-01");
  await page.getByLabel("Until", { exact: true }).fill("23:30");
  await page.getByLabel("Activity budget").fill("100");
  await page.getByRole("button", { name: "Live music", exact: true }).click();
  await page.getByRole("button", { name: "Find what’s worth it" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("article").locator("summary").click();
  await expect(page.getByRole("article")).toContainText("35% weight · 100/100");
  await expect(page.getByRole("article")).not.toContainText(
    "Semantic interest match powered by deAPI",
  );
  // Next's route announcer has role=alert; check the application's error state.
  await expect(page.locator(".empty-state[role='alert']")).toHaveCount(0);
});
