import { minutes } from "./preferences";
import { budgetCurrency, money, resolveSearchLocation } from "./location";
import {
  WEIGHTS,
  type Activity,
  type InterestMatcher,
  type Preferences,
  type ScoredActivity,
  type ScoreCategory,
} from "./types";

const clamp = (n: number) =>
  Math.round(Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)));
export const tagMatcher: InterestMatcher = {
  async match(activity, interests) {
    const matches = activity.interests.filter((tag) =>
      interests.includes(tag),
    ).length;
    return matches
      ? clamp(70 + (30 * matches) / activity.interests.length)
      : 10;
  },
};

/** Consume only a server-provided Interest Fit; original matcher remains the fallback. */
export const providedInterestMatcher: InterestMatcher = {
  async match(activity, interests) {
    return activity.interestMatch &&
      Number.isFinite(activity.interestMatch.score)
      ? clamp(activity.interestMatch.score)
      : tagMatcher.match(activity, interests);
  },
};

/** Same five-component weighted engine. Unknown facts use explicit policies, never invented values. */
export function scoreActivity(
  a: Activity,
  p: Preferences,
  interestFit: number,
): ScoredActivity {
  const blockers: string[] = [];
  const uncertainties: string[] = [];
  const preferenceConflicts: string[] = [];
  const isLive = !a.source.isMock;
  const currency = budgetCurrency(p);
  const eventCurrency = a.currency ?? (a.source.isMock ? "GBP" : null);
  const min = a.source.isMock ? a.price : (a.priceMin ?? a.price);
  const max = a.source.isMock ? a.price : (a.priceMax ?? null);
  const priceKnown = min != null && max != null && eventCurrency === currency;
  if (isLive && !a.source.url)
    uncertainties.push(
      "Source event URL unavailable; verify provenance before planning.",
    );
  let budgetFit = 50;
  let budgetExplanation =
    "Price unavailable or incomplete: neutral Budget Fit 50/100. Not treated as free or over budget.";
  if (priceKnown) {
    budgetFit =
      max === 0 || max <= p.maxBudget ? 100 : clamp((100 * p.maxBudget) / max);
    budgetExplanation = `${money(min, currency)}–${money(max, currency)} listed range / ${money(p.maxBudget, currency)} activity budget. Uses the upper price for fit; availability, fees and transport are not included.`;
    if (min > p.maxBudget)
      blockers.push(
        `${money(min, currency)} minimum price is above your ${money(p.maxBudget, currency)} activity budget.`,
      );
    else if (max > p.maxBudget)
      uncertainties.push(
        "The price range crosses your budget; affordable ticket availability is unconfirmed.",
      );
  } else {
    const issue =
      eventCurrency && eventCurrency !== currency
        ? `Listed currency ${eventCurrency} differs from your ${currency} budget. No currency conversion is applied.`
        : "Price unavailable or incomplete; check the source before planning.";
    uncertainties.push(issue);
    budgetExplanation += ` ${issue}`;
  }

  const travelKnown = a.distanceKm != null && a.travelMinutesOneWay != null;
  const travelFit =
    a.distanceKm != null
      ? clamp(100 * (1 - a.distanceKm / (p.maxDistanceKm * 2)))
      : 50;
  if (a.distanceKm != null && a.distanceKm > p.maxDistanceKm)
    blockers.push(
      `${a.distanceKm} km is beyond your ${p.maxDistanceKm} km travel limit.`,
    );
  if (!travelKnown)
    uncertainties.push(
      "Travel distance or travel-time estimate unavailable; travel limits cannot be verified.",
    );
  const travelExplanation =
    a.distanceKm != null
      ? `${a.distanceKm} km straight-line estimate from ${a.distanceOrigin ?? "the demo neighborhood center"} / ${p.maxDistanceKm} km limit. Travel time is an 8 min/km + 5 min estimate each way, not a route.`
      : "Travel unavailable: neutral Travel Fit 50/100. Starting coordinates or venue coordinates are missing; no geocoding or routing was performed.";

  const expectedTimezone = resolveSearchLocation(p.location).timezone;
  const timezoneKnown =
    !isLive ||
    (!!a.timezone && (!expectedTimezone || a.timezone === expectedTimezone));
  const startConfirmed =
    !!a.date &&
    !!a.startTime &&
    (a.dateStatus ?? "confirmed") === "confirmed" &&
    (a.timeStatus ?? "confirmed") === "confirmed" &&
    timezoneKnown;
  const endConfirmed =
    !!a.endTime && (a.endTimeStatus ?? "confirmed") === "confirmed";
  const fullTripKnown =
    startConfirmed && endConfirmed && a.durationMinutes != null && travelKnown;
  const tripMinutes = fullTripKnown
    ? a.durationMinutes! + a.travelMinutesOneWay! * 2
    : null;
  let timeFit = 0;
  let timeExplanation =
    "Time Fit 0/100: date, start time or timezone is unavailable, TBD/TBA or approximate. A precise fit cannot be calculated.";
  if (startConfirmed) {
    const startInWindow =
      a.date === p.date &&
      minutes(a.startTime!) >= minutes(p.startTime) &&
      minutes(a.startTime!) <= minutes(p.endTime);
    const arrivalFits =
      startInWindow &&
      (!travelKnown ||
        minutes(a.startTime!) - a.travelMinutesOneWay! >= minutes(p.startTime));
    if (!arrivalFits)
      blockers.push(
        "The event start or outward trip falls outside your time window.",
      );
    if (fullTripKnown) {
      const endFits =
        (a.endDate ?? a.date) === p.date &&
        minutes(a.endTime!) + a.travelMinutesOneWay! <= minutes(p.endTime);
      if (!endFits)
        blockers.push(
          "The event end or return trip falls outside your time window.",
        );
      if (tripMinutes! > p.availableMinutes)
        blockers.push(
          `Needs ${tripMinutes} minutes including return travel; you have ${p.availableMinutes}.`,
        );
      timeFit =
        arrivalFits && endFits
          ? clamp(100 * Math.min(1, p.availableMinutes / tripMinutes!))
          : 0;
      timeExplanation = `${tripMinutes} min including estimated ${a.travelMinutesOneWay} min each way. ${arrivalFits && endFits ? "Fits your chosen local time window." : "Outside your chosen local time window."}`;
    } else {
      timeFit = arrivalFits ? 50 : 0;
      timeExplanation = `${arrivalFits ? "The confirmed start fits the selected event-local window; partial Time Fit 50/100." : "The confirmed start is outside the window; Time Fit 0/100."} End time, duration or travel is missing or uncertain. Full-trip fit is unverified.`;
      uncertainties.push(
        "Full-trip duration cannot be verified; end time, duration or travel is missing/uncertain.",
      );
    }
  } else
    uncertainties.push(
      "Event date/time or timezone is unconfirmed; a reliable Time Fit is unavailable.",
    );
  if (["canceled", "cancelled", "postponed"].includes(a.eventStatus ?? ""))
    blockers.push(
      `Ticketmaster marks this event ${a.eventStatus}; do not plan a trip.`,
    );

  let penalty = 0;
  if (p.dislikes.includes("Crowds")) {
    if (a.crowd === null)
      uncertainties.push(
        "Crowd level unavailable; your crowd preference cannot be checked.",
      );
    else if (a.crowd !== "low") {
      penalty += a.crowd === "high" ? 45 : 20;
      preferenceConflicts.push(
        a.crowd === "high"
          ? "Likely crowded, which you prefer to avoid."
          : "Moderate crowds may not suit you.",
      );
    }
  }
  if (p.dislikes.includes("Loud spaces")) {
    if (a.loud === null)
      uncertainties.push(
        "Noise level unavailable; your noise preference cannot be checked.",
      );
    else if (a.loud) {
      penalty += 40;
      preferenceConflicts.push(
        "The loud setting conflicts with your preferences.",
      );
    }
  }
  if (p.dislikes.includes("Outdoor plans")) {
    if (a.outdoors === null)
      uncertainties.push(
        "Indoor/outdoor setting unavailable; this preference cannot be checked.",
      );
    else if (a.outdoors) {
      penalty += 40;
      preferenceConflicts.push("This is outdoors, which you prefer to avoid.");
    }
  }
  const values: Record<ScoreCategory, number> = {
    "Interest Fit": clamp(interestFit - penalty),
    "Time Fit": timeFit,
    "Budget Fit": budgetFit,
    "Travel Fit": travelFit,
    "Evidence Confidence": clamp(a.source.confidence),
  };
  const explanations: Record<ScoreCategory, string> = {
    "Interest Fit": `${a.interests.filter((tag) => p.interests.includes(tag)).join(" + ") || "No selected interest matches"}. ${isLive ? `Deterministic mapping from Ticketmaster classifications: ${a.classifications?.join(", ") || "unavailable"}.` : "Matched using mock activity tags."} ${preferenceConflicts.join(" ")}`,
    "Time Fit": timeExplanation,
    "Budget Fit": budgetExplanation,
    "Travel Fit": travelExplanation,
    "Evidence Confidence": `${a.source.isMock ? "Mock completeness, not verification." : "Ticketmaster field completeness, not a guarantee."} URL 20 + confirmed date 15 + start time 10 + confirmed timing/timezone 10 + venue 10 + city 5 + coordinates 10 + complete price/currency 10 + classification 10. ${a.source.note}`,
  };
  if (a.interestMatch?.mode === "semantic") {
    explanations["Interest Fit"] =
      `Semantic interest match powered by deAPI (${a.interestMatch.model}). Cosine ${a.interestMatch.similarity?.toFixed(3)} → ${a.interestMatch.score}/100 using ${a.interestMatch.mapping}. Public Ticketmaster metadata and your original interests only. ${preferenceConflicts.join(" ")}`;
  }
  const breakdown = (Object.keys(WEIGHTS) as ScoreCategory[]).map(
    (category) => ({
      category,
      score: values[category],
      weight: WEIGHTS[category],
      explanation: explanations[category],
    }),
  );
  const score = Math.round(
    breakdown.reduce(
      (total, item) => total + (item.score * item.weight) / 100,
      0,
    ),
  );
  const verdict =
    blockers.length || score < 50
      ? "Skip"
      : score >= 75 &&
          values["Interest Fit"] >= 60 &&
          values["Evidence Confidence"] >= 60 &&
          !uncertainties.length
        ? "Worth a trip"
        : "Go if nearby";
  const matches = a.interests.filter((tag) => p.interests.includes(tag));
  const why =
    blockers[0] ??
    (a.interestMatch?.mode === "semantic"
      ? `Semantic interest fit ${values["Interest Fit"]}/100 from your interests and the source metadata${uncertainties.length ? "; some planning checks are unverified." : "."}`
      : matches.length
        ? `A match for ${matches.map((tag) => tag.toLowerCase()).join(" and ")}${uncertainties.length ? "; some planning checks are unverified." : `, with ${min === 0 && max === 0 ? "free entry" : money(max!, currency) + " activity spend"} and a ${a.distanceKm} km straight-line estimate.`}`
        : "No selected interest matches; other components contribute to the score.");
  const tradeOff =
    preferenceConflicts[0] ?? uncertainties[0] ?? blockers[1] ?? a.tradeOff;
  return {
    ...a,
    score,
    verdict,
    why,
    tradeOff,
    breakdown,
    blockers,
    uncertainties,
  };
}
export async function rankActivities(
  activities: Activity[],
  preferences: Preferences,
  matcher: InterestMatcher = tagMatcher,
): Promise<ScoredActivity[]> {
  const scored = await Promise.all(
    activities.map(async (activity) =>
      scoreActivity(
        activity,
        preferences,
        await matcher.match(activity, preferences.interests),
      ),
    ),
  );
  const order = { "Worth a trip": 0, "Go if nearby": 1, Skip: 2 };
  return scored.sort(
    (a, b) =>
      order[a.verdict] - order[b.verdict] ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  );
}
