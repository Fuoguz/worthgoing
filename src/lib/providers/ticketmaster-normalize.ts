import type {
  Activity,
  Interest,
  Preferences,
  SearchDiagnostics,
} from "../types";
import { resolveSearchLocation, straightLineDistance } from "../location";
import { evidenceConfidence } from "../evidence";

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as ObjectValue)
    : {};
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const number = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const coordinate = (v: unknown, limit: number): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : number(v);
  return n != null && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};
export function sourceUrl(v: unknown): string | null {
  const value = text(v);
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      ![...url.searchParams.keys()].some((key) =>
        /apikey|api_key|token/i.test(key),
      )
      ? value
      : null;
  } catch {
    return null;
  }
}
function date(v: unknown): string | null {
  const s = text(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
    ? s
    : null;
}
function time(v: unknown): string | null {
  const s = text(v);
  return s && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)
    ? s.slice(0, 5)
    : null;
}
function timestamp(v: unknown): string | null {
  const s = text(v);
  return s && /(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s))
    ? s
    : null;
}
function timezone(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: s });
    return s;
  } catch {
    return null;
  }
}
function names(rows: unknown, keys: string[]): string[] {
  return [
    ...new Set(
      (Array.isArray(rows) ? rows : [])
        .flatMap((row) =>
          keys.map((key) => text(object(object(row)[key]).name)),
        )
        .filter(
          (v): v is string =>
            !!v && !/^(undefined|other|not defined)$/i.test(v),
        ),
    ),
  ];
}
export function classificationInterests(classifications: string[]): Interest[] {
  const values = classifications.map((v) => v.toLowerCase());
  const result: Interest[] = [];
  if (values.includes("music")) result.push("Live music");
  if (
    values.some((v) =>
      [
        "arts & theatre",
        "theatre",
        "comedy",
        "dance",
        "fine art",
        "cultural",
      ].includes(v),
    )
  )
    result.push("Art & culture");
  if (values.some((v) => ["film", "movie", "cinema"].includes(v)))
    result.push("Film");
  if (
    values.some((v) => ["food & drink", "food", "wine", "culinary"].includes(v))
  )
    result.push("Food & drink");
  if (values.some((v) => ["workshop", "workshops", "educational"].includes(v)))
    result.push("Workshops");
  if (values.some((v) => ["markets", "market"].includes(v)))
    result.push("Markets");
  if (values.some((v) => ["nature", "outdoors"].includes(v)))
    result.push("Nature");
  return [...new Set(result)];
}

export function normalizeEvent(raw: unknown, p: Preferences): Activity | null {
  const event = object(raw);
  const id = text(event.id);
  const title = text(event.name);
  if (
    !id ||
    !title ||
    (event.type && event.type !== "event") ||
    event.test === true
  )
    return null;
  const dates = object(event.dates);
  const start = object(dates.start);
  const end = object(dates.end);
  const venues = object(event._embedded).venues;
  const venue = object(Array.isArray(venues) ? venues[0] : undefined);
  const coordinates = object(venue.location);
  const latitude = coordinate(coordinates.latitude, 90);
  const longitude = coordinate(coordinates.longitude, 180);
  const location = resolveSearchLocation(p.location);
  const distanceKm =
    location.origin && latitude != null && longitude != null
      ? straightLineDistance(location.origin, [latitude, longitude])
      : null;
  const flags = {
    dateTBD: start.dateTBD === true,
    dateTBA: start.dateTBA === true,
    timeTBA: start.timeTBA === true,
    noSpecificTime: start.noSpecificTime === true,
    startApproximate: start.approximate === true,
    endApproximate: end.approximate === true,
  };
  const eventDate = date(start.localDate);
  const startTime = time(start.localTime);
  const endDate = date(end.localDate);
  const endTime = time(end.localTime);
  const dateStatus = flags.dateTBD
    ? "TBD"
    : flags.dateTBA
      ? "TBA"
      : flags.startApproximate
        ? "approximate"
        : eventDate
          ? "confirmed"
          : "unknown";
  const timeStatus =
    start.timeTBD === true
      ? "TBD"
      : flags.timeTBA
        ? "TBA"
        : flags.noSpecificTime || flags.startApproximate
          ? "approximate"
          : startTime
            ? "confirmed"
            : "unknown";
  const endTimeStatus =
    flags.endApproximate || end.noSpecificTime === true
      ? "approximate"
      : endTime && (endDate || eventDate)
        ? "confirmed"
        : "unknown";
  const startDateTime = timestamp(start.dateTime);
  const endDateTime = timestamp(end.dateTime);
  // Only derive a duration from actual start AND end instants; never use doors/access times.
  const durationMinutes =
    dateStatus === "confirmed" &&
    timeStatus === "confirmed" &&
    endTimeStatus === "confirmed" &&
    startDateTime &&
    endDateTime &&
    Date.parse(endDateTime) > Date.parse(startDateTime)
      ? (Date.parse(endDateTime) - Date.parse(startDateTime)) / 60000
      : null;
  const classifications = names(event.classifications, [
    "segment",
    "genre",
    "subGenre",
    "type",
    "subType",
  ]);
  const genres = names(event.classifications, ["genre", "subGenre"]);
  const priceRanges = (
    Array.isArray(event.priceRanges) ? event.priceRanges : []
  ).flatMap((rawPrice) => {
    const range = object(rawPrice);
    const min = number(range.min);
    const max = number(range.max);
    const code = text(range.currency);
    const currency = code && /^[A-Z]{3}$/.test(code) ? code : null;
    if (
      (min == null && max == null) ||
      (min != null && min < 0) ||
      (max != null && max < 0) ||
      (min != null && max != null && max < min)
    )
      return [];
    return [{ min, max, currency }];
  });
  const currencies = [...new Set(priceRanges.map((range) => range.currency))];
  const currency = currencies.length === 1 ? currencies[0] : null;
  const mins = priceRanges
    .map((range) => range.min)
    .filter((v): v is number => v != null);
  const maxes = priceRanges
    .map((range) => range.max)
    .filter((v): v is number => v != null);
  const priceMin = currency && mins.length ? Math.min(...mins) : null;
  const priceMax = currency && maxes.length ? Math.max(...maxes) : null;
  const images = (Array.isArray(event.images) ? event.images : [])
    .map(object)
    .filter((img) => sourceUrl(img.url))
    .sort(
      (a, b) =>
        (a.ratio === "16_9" ? 0 : 1) - (b.ratio === "16_9" ? 0 : 1) ||
        (number(b.width) ?? 0) - (number(a.width) ?? 0),
    );
  const image = images[0];
  const description = text(event.description);
  const activity: Activity = {
    id: `ticketmaster:${id}`,
    title,
    description: description
      ? description.replace(/<[^>]*>/g, "").slice(0, 2000)
      : null,
    date: eventDate,
    startTime,
    endDate,
    endTime,
    durationMinutes,
    startDateTime,
    endDateTime,
    dateStatus,
    timeStatus,
    endTimeStatus,
    timingFlags: flags,
    timezone: timezone(dates.timezone) ?? timezone(venue.timezone),
    eventStatus: text(object(dates.status).code),
    venue: text(venue.name),
    city: text(object(venue.city).name),
    latitude,
    longitude,
    distanceKm,
    travelMinutesOneWay:
      distanceKm != null ? Math.ceil(distanceKm * 8 + 5) : null,
    distanceOrigin: distanceKm != null ? location.originLabel : null,
    price: priceMin,
    priceMin,
    priceMax,
    currency,
    priceRanges,
    interests: classificationInterests(classifications),
    classifications,
    classificationDetails: (Array.isArray(event.classifications)
      ? event.classifications
      : []
    ).map((row) => {
      const c = object(row);
      const name = (key: string) => {
        const value = text(object(c[key]).name);
        return value && !/^(undefined|other|not defined)$/i.test(value)
          ? value
          : null;
      };
      return {
        segment: name("segment"),
        genre: name("genre"),
        subgenre: name("subGenre"),
        type: name("type"),
        subtype: name("subType"),
      };
    }),
    genres,
    crowd: null,
    loud: null,
    outdoors: null,
    illustration: null,
    image: image
      ? {
          url: sourceUrl(image.url)!,
          attribution: text(image.attribution),
          fallback: image.fallback === true,
        }
      : null,
    source: {
      name: "Ticketmaster",
      url: sourceUrl(event.url),
      isMock: false,
      confidence: 0,
      note: "Field completeness from Ticketmaster Discovery API; availability and fees still require checking.",
    },
    tradeOff:
      "Ticket availability, additional fees and travel conditions need checking at the source.",
  };
  activity.source.confidence = evidenceConfidence(activity).score;
  return activity;
}

export class InvalidTicketmasterResponse extends Error {
  constructor() {
    super("Ticketmaster returned an invalid response.");
  }
}
export function normalizeResponse(
  raw: unknown,
  p: Preferences,
): { activities: Activity[]; diagnostics: SearchDiagnostics } {
  const data = object(raw);
  const page = object(data.page);
  const totalAvailable = number(page.totalElements);
  const embedded = object(data._embedded);
  const rows = embedded.events;
  if (
    !Array.isArray(rows) &&
    !(totalAvailable === 0 && (rows === undefined || Array.isArray(rows)))
  )
    throw new InvalidTicketmasterResponse();
  const rawEvents = Array.isArray(rows) ? rows : [];
  const activities: Activity[] = [];
  const seenIds = new Set<string>();
  const seenOccurrences = new Set<string>();
  let duplicatesRemoved = 0,
    rejectedCount = 0;
  for (const event of rawEvents) {
    const activity = normalizeEvent(event, p);
    if (!activity) {
      rejectedCount++;
      continue;
    }
    const occurrenceKey = activity.source.url
      ? `${activity.source.url}|${activity.date}|${activity.startTime}|${activity.venue}`
      : null;
    if (
      seenIds.has(activity.id) ||
      (occurrenceKey && seenOccurrences.has(occurrenceKey))
    ) {
      duplicatesRemoved++;
      continue;
    }
    seenIds.add(activity.id);
    if (occurrenceKey) seenOccurrences.add(occurrenceKey);
    activities.push(activity);
  }
  return {
    activities,
    diagnostics: {
      rawCount: rawEvents.length,
      normalizedCount: activities.length,
      duplicatesRemoved,
      rejectedCount,
      totalAvailable,
    },
  };
}
