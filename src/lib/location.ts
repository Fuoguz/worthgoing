import type { Preferences } from "./types";
export type Point = [number, number];
export interface SearchLocation {
  city: string;
  countryCode?: string;
  timezone?: string;
  origin: Point | null;
  originLabel: string | null;
  currency: string | null;
}
const LONDON_ORIGINS: Record<string, Point> = {
  shoreditch: [51.5246, -0.0786],
  soho: [51.5136, -0.1365],
  hackney: [51.545, -0.0553],
  camden: [51.539, -0.1426],
  london: [51.5074, -0.1278],
  "central london": [51.5074, -0.1278],
};
const COUNTRIES: Record<string, string> = {
  uk: "GB",
  gb: "GB",
  "united kingdom": "GB",
  us: "US",
  usa: "US",
  "united states": "US",
  ca: "CA",
  canada: "CA",
};
export function resolveSearchLocation(input: string): SearchLocation {
  const value = input.trim();
  const lower = value.toLowerCase();
  const londonName = Object.keys(LONDON_ORIGINS).find(
    (name) =>
      lower === name ||
      lower === `${name}, london` ||
      lower === `${name}, uk` ||
      lower === `${name}, gb`,
  );
  if (londonName)
    return {
      city: "London",
      countryCode: "GB",
      timezone: "Europe/London",
      origin: LONDON_ORIGINS[londonName],
      originLabel: `${londonName} neighborhood/city center`,
      currency: "GBP",
    };
  if (
    [
      "new york",
      "new york city",
      "nyc",
      "new york, us",
      "new york, usa",
      "new york, united states",
    ].includes(lower)
  )
    return {
      city: "New York",
      countryCode: "US",
      timezone: "America/New_York",
      origin: [40.7128, -74.006],
      originLabel: "New York city center",
      currency: "USD",
    };
  const parts = value.split(",").map((part) => part.trim());
  const countryCode =
    parts.length === 2 ? COUNTRIES[parts[1].toLowerCase()] : undefined;
  return {
    city: parts[0],
    countryCode,
    origin: null,
    originLabel: null,
    currency:
      countryCode === "GB"
        ? "GBP"
        : countryCode === "US"
          ? "USD"
          : countryCode === "CA"
            ? "CAD"
            : null,
  };
}
export function budgetCurrency(p: Preferences): string {
  return (
    p.budgetCurrency ?? resolveSearchLocation(p.location).currency ?? "GBP"
  );
}
export function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
export function straightLineDistance(a: Point, b: Point): number {
  const rad = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) *
      Math.cos(rad(b[0])) *
      Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return (
    Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10
  );
}
