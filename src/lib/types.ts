export const INTERESTS = [
  "Art & culture",
  "Food & drink",
  "Nature",
  "Live music",
  "Film",
  "Markets",
  "Workshops",
] as const;
export type Interest = (typeof INTERESTS)[number];
export const DISLIKES = ["Crowds", "Loud spaces", "Outdoor plans"] as const;
export type Dislike = (typeof DISLIKES)[number];

export interface Preferences {
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  availableMinutes: number;
  maxBudget: number;
  maxDistanceKm: number;
  interests: Interest[];
  dislikes: Dislike[];
  interestText?: string;
  budgetCurrency?: string;
}

export type Illustration = "canal" | "gallery" | "market" | "jazz" | "cinema";
export interface Activity {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  venue: string | null;
  distanceKm: number | null;
  travelMinutesOneWay: number | null;
  price: number | null;
  interests: Interest[];
  crowd: "low" | "medium" | "high" | null;
  loud: boolean | null;
  outdoors: boolean | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  endDate?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  dateStatus?: "confirmed" | "TBD" | "TBA" | "approximate" | "unknown";
  timeStatus?: "confirmed" | "TBD" | "TBA" | "approximate" | "unknown";
  endTimeStatus?: "confirmed" | "approximate" | "unknown";
  timingFlags?: {
    dateTBD: boolean;
    dateTBA: boolean;
    timeTBA: boolean;
    noSpecificTime: boolean;
    startApproximate: boolean;
    endApproximate: boolean;
  };
  eventStatus?: string | null;
  image?: { url: string; attribution: string | null; fallback: boolean } | null;
  classifications?: string[];
  classificationDetails?: {
    segment: string | null;
    genre: string | null;
    subgenre: string | null;
    type: string | null;
    subtype: string | null;
  }[];
  interestMatch?: InterestMatch;
  genres?: string[];
  priceRanges?: {
    min: number | null;
    max: number | null;
    currency: string | null;
  }[];
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  distanceOrigin?: string | null;
  source: {
    name: string;
    url: string | null;
    confidence: number;
    note: string;
    isMock: boolean;
  };
  illustration: Illustration | null;
  tradeOff: string;
}

export const WEIGHTS = {
  "Interest Fit": 35,
  "Time Fit": 20,
  "Budget Fit": 15,
  "Travel Fit": 15,
  "Evidence Confidence": 15,
} as const;
export type ScoreCategory = keyof typeof WEIGHTS;
export type Verdict = "Worth a trip" | "Go if nearby" | "Skip";
export interface ScoredActivity extends Activity {
  score: number;
  verdict: Verdict;
  why: string;
  tradeOff: string;
  breakdown: {
    category: ScoreCategory;
    score: number;
    weight: number;
    explanation: string;
  }[];
  blockers: string[];
  uncertainties: string[];
}

/** Source adapters return normalized facts, never a final score. */
export interface ActivityProvider {
  id: string;
  search(preferences: Preferences, signal?: AbortSignal): Promise<Activity[]>;
}

/** An embeddings adapter can replace tag matching without changing the weights. */
export interface InterestMatcher {
  match(activity: Activity, interests: Interest[]): Promise<number>;
}

export type InterestFallbackReason =
  | "missing-key"
  | "timeout"
  | "unauthorized"
  | "rate-limit"
  | "http-error"
  | "job-failed"
  | "malformed-response"
  | "invalid-vector"
  | "dimension-mismatch"
  | "mock-data"
  | "missing-metadata";
export interface InterestMatch {
  mode: "semantic" | "keyword-fallback";
  score: number;
  similarity: number | null;
  model: string | null;
  dimensions: number | null;
  mapping: string | null;
  reason: InterestFallbackReason | null;
}
export interface InterestSearchDiagnostics {
  model: string;
  requestCount: number;
  inputCount: number;
  cacheHits: number;
  latencyMs: number;
  semanticCount: number;
  fallbackCount: number;
  submitLatencyMs?: number;
  completionLatencyMs?: number;
  httpRequestCount?: number;
  pollCount?: number;
}

export type FallbackReason =
  | "missing-key"
  | "api-error"
  | "timeout"
  | "malformed-response"
  | "no-results"
  | "unusable-data";
export interface SearchDiagnostics {
  rawCount: number;
  normalizedCount: number;
  duplicatesRemoved: number;
  rejectedCount: number;
  totalAvailable: number | null;
}
export interface SearchResult {
  activities: Activity[];
  dataMode: "live" | "mock" | "unavailable";
  reason: FallbackReason | null;
  message: string;
  diagnostics: SearchDiagnostics;
  interestDiagnostics?: InterestSearchDiagnostics;
}
