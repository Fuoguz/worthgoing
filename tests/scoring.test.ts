import { describe, it, expect } from "vitest";
import {
  defaultPreferences,
  parsePreferences,
  validatePreferences,
} from "../src/lib/preferences";
import { mockProvider } from "../src/lib/providers/mock";
import { rankActivities, scoreActivity, tagMatcher } from "../src/lib/scoring";
import { WEIGHTS } from "../src/lib/types";

describe("WorthGoing decisions", () => {
  it("returns exactly five normalized mock activities with source URLs", async () => {
    const p = defaultPreferences();
    const activities = await mockProvider.search(p);
    expect(activities).toHaveLength(5);
    for (const a of activities) {
      expect(a.date).toBe(p.date);
      expect(a.source.url).toMatch(/^https:\/\//);
      expect(a.source.isMock).toBe(true);
    }
  });
  it("uses the requested weights and produces a repeatable weighted score", async () => {
    expect(WEIGHTS).toEqual({
      "Interest Fit": 35,
      "Time Fit": 20,
      "Budget Fit": 15,
      "Travel Fit": 15,
      "Evidence Confidence": 15,
    });
    const p = defaultPreferences();
    const a = (await mockProvider.search(p))[0];
    const fit = await tagMatcher.match(a, p.interests);
    const result = scoreActivity(a, p, fit);
    expect(result.score).toBe(
      Math.round(
        result.breakdown.reduce(
          (sum, item) => sum + (item.score * item.weight) / 100,
          0,
        ),
      ),
    );
    expect(scoreActivity(a, p, fit)).toEqual(result);
    expect(result.verdict).toBe("Worth a trip");
  });
  it("rejects over-budget activities even when the overall score is high", async () => {
    const p = defaultPreferences();
    const a = (await mockProvider.search(p))[0];
    const result = scoreActivity(a, { ...p, maxBudget: a.price - 1 }, 100);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.verdict).toBe("Skip");
    expect(result.blockers.join()).toContain("budget");
  });
  it("counts return travel in both the window and available-time constraint", async () => {
    const p = defaultPreferences();
    const a = (await mockProvider.search(p))[0];
    expect(
      scoreActivity(a, { ...p, availableMinutes: a.durationMinutes }, 100)
        .verdict,
    ).toBe("Skip");
    expect(
      scoreActivity(
        a,
        { ...p, startTime: a.startTime, endTime: a.endTime },
        100,
      ).verdict,
    ).toBe("Skip");
  });
  it("doesn't claim a time fit on a different date", async () => {
    const p = defaultPreferences();
    const a = (await mockProvider.search(p))[0];
    const result = scoreActivity({ ...a, date: "2000-01-01" }, p, 100);
    expect(result.verdict).toBe("Skip");
    expect(result.breakdown[1].score).toBe(0);
  });
  it("keeps distance beyond the radius from earning a trip", async () => {
    const p = defaultPreferences();
    const a = (await mockProvider.search(p))[0];
    expect(scoreActivity(a, { ...p, maxDistanceKm: 0.5 }, 100).verdict).toBe(
      "Skip",
    );
  });
  it("low confidence and low interest cannot earn a dedicated trip", async () => {
    const p = defaultPreferences();
    const a = (await mockProvider.search(p))[0];
    expect(
      scoreActivity({ ...a, source: { ...a.source, confidence: 59 } }, p, 100)
        .verdict,
    ).toBe("Go if nearby");
    expect(scoreActivity(a, p, 10).verdict).toBe("Go if nearby");
  });
  it("crowd dislikes lower fit and appear in the trade-off", async () => {
    const p = defaultPreferences();
    const a = (await mockProvider.search(p))[2];
    const base = scoreActivity(a, p, 100);
    const avoid = scoreActivity(a, { ...p, dislikes: ["Crowds"] }, 100);
    expect(avoid.score).toBeLessThan(base.score);
    expect(avoid.tradeOff).toContain("crowded");
  });
  it("supports a zero budget and free entry without NaN", async () => {
    const p = { ...defaultPreferences(), maxBudget: 0 };
    const a = (await mockProvider.search(p))[0];
    const result = scoreActivity({ ...a, price: 0 }, p, 100);
    expect(result.breakdown[2].score).toBe(100);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(scoreActivity(a, p, 100).verdict).toBe("Skip");
  });
  it("makes a negative recommendation possible with all five candidates retained", async () => {
    const p = { ...defaultPreferences(), availableMinutes: 30 };
    const results = await rankActivities(await mockProvider.search(p), p);
    expect(results).toHaveLength(5);
    expect(results.every((a) => a.verdict === "Skip")).toBe(true);
  });
  it("supports empty geography and aborts without fabricating nearby plans", async () => {
    const p = { ...defaultPreferences(), location: "Paris" };
    expect(await mockProvider.search(p)).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      mockProvider.search(defaultPreferences(), controller.signal),
    ).rejects.toThrow("aborted");
  });
  it("validates malformed preferences and time windows", () => {
    const p = defaultPreferences();
    expect(validatePreferences(p)).toBeNull();
    expect(
      validatePreferences({ ...p, startTime: "22:00", endTime: "12:00" }),
    ).toContain("End time");
    expect(validatePreferences({ ...p, date: "2099-02-31" })).toContain(
      "valid date",
    );
    expect(validatePreferences({ ...p, interests: [] })).toContain("interest");
    expect(parsePreferences("not-json")).toBeNull();
    expect(parsePreferences('{"location":0}')).toBeNull();
    expect(
      parsePreferences(JSON.stringify({ ...p, interests: ["invalid"] })),
    ).toBeNull();
    expect(parsePreferences(JSON.stringify(p))).toEqual(p);
  });
});
