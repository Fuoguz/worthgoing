import { DISLIKES, INTERESTS, type Preferences } from "./types";

export const STORAGE_KEY = "worthgoing.preferences.v1";

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function defaultPreferences(): Preferences {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    location: "Shoreditch, London",
    date: localDate(tomorrow),
    startTime: "12:00",
    endTime: "22:00",
    availableMinutes: 240,
    maxBudget: 35,
    maxDistanceKm: 8,
    interests: ["Art & culture", "Food & drink", "Nature"],
    dislikes: [],
  };
}

export function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

export function validatePreferences(p: Preferences): string | null {
  if (!p.location.trim()) return "Add a starting location.";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
    Number.isNaN(Date.parse(p.date + "T12:00:00")) ||
    localDate(new Date(p.date + "T12:00:00")) !== p.date
  )
    return "Choose a valid date.";
  if (p.date < localDate()) return "Choose today or a future date.";
  if (
    ![p.startTime, p.endTime].every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
  )
    return "Choose a valid time window.";
  if (minutes(p.endTime) <= minutes(p.startTime))
    return "End time must be after start time. Choose a window within one day.";
  if (
    !Number.isFinite(p.availableMinutes) ||
    p.availableMinutes < 30 ||
    p.availableMinutes > 720
  )
    return "Available time must be between 30 minutes and 12 hours.";
  if (!Number.isFinite(p.maxBudget) || p.maxBudget < 0 || p.maxBudget > 500)
    return "Budget must be between £0 and £500.";
  if (
    !Number.isFinite(p.maxDistanceKm) ||
    p.maxDistanceKm < 0.5 ||
    p.maxDistanceKm > 50
  )
    return "Travel distance must be between 0.5 and 50 km.";
  if (
    p.interestText !== undefined &&
    (typeof p.interestText !== "string" || p.interestText.length > 1000)
  )
    return "Describe your interests in 1,000 characters or fewer.";
  if (!p.interests.length && !p.interestText?.trim())
    return "Choose at least one interest.";
  return null;
}

/** Guard untrusted/stale localStorage values before using them. */
export function parsePreferences(
  raw: string | null,
  refreshExpiredDate = true,
): Preferences | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.location !== "string" ||
      typeof p.date !== "string" ||
      typeof p.startTime !== "string" ||
      typeof p.endTime !== "string" ||
      typeof p.availableMinutes !== "number" ||
      typeof p.maxBudget !== "number" ||
      typeof p.maxDistanceKm !== "number" ||
      !Array.isArray(p.interests) ||
      !p.interests.every((v: unknown) =>
        INTERESTS.includes(v as (typeof INTERESTS)[number]),
      ) ||
      !Array.isArray(p.dislikes) ||
      !p.dislikes.every((v: unknown) =>
        DISLIKES.includes(v as (typeof DISLIKES)[number]),
      )
    )
      return null;
    const preferences = p as Preferences;
    // Keep saved choices but move expired dates to the next demo day.
    if (refreshExpiredDate && preferences.date < localDate())
      preferences.date = defaultPreferences().date;
    if (
      preferences.budgetCurrency !== undefined &&
      (typeof preferences.budgetCurrency !== "string" ||
        !/^[A-Z]{3}$/.test(preferences.budgetCurrency))
    )
      return null;
    return validatePreferences(preferences) ? null : preferences;
  } catch {
    return null;
  }
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00"));
}
export function formatTime(time: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(`2000-01-01T${time}:00`));
}
