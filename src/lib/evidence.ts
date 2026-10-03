import type { Activity } from "./types";
export const EVIDENCE_WEIGHTS = {
  sourceUrl: 20,
  date: 15,
  startTime: 10,
  confirmedTiming: 10,
  venue: 10,
  city: 5,
  coordinates: 10,
  price: 10,
  classification: 10,
} as const;
export function evidenceConfidence(a: Activity): {
  score: number;
  signals: Record<keyof typeof EVIDENCE_WEIGHTS, boolean>;
} {
  const signals = {
    sourceUrl: !!a.source.url,
    date: !!a.date && (a.dateStatus ?? "confirmed") === "confirmed",
    startTime: !!a.startTime,
    confirmedTiming:
      !!a.date &&
      !!a.startTime &&
      (a.dateStatus ?? "confirmed") === "confirmed" &&
      (a.timeStatus ?? "confirmed") === "confirmed" &&
      (a.source.isMock || !!a.timezone),
    venue: !!a.venue,
    city: !!a.city,
    coordinates: a.latitude != null && a.longitude != null,
    price: a.priceMin != null && a.priceMax != null && !!a.currency,
    classification: !!a.classifications?.length,
  };
  const score = (
    Object.keys(EVIDENCE_WEIGHTS) as (keyof typeof EVIDENCE_WEIGHTS)[]
  ).reduce((sum, key) => sum + (signals[key] ? EVIDENCE_WEIGHTS[key] : 0), 0);
  return { score, signals };
}
