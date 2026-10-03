import "server-only";
import { mockProvider } from "./mock";
import { TicketmasterError, TicketmasterProvider } from "./ticketmaster";
import type {
  Preferences,
  SearchResult,
  SearchDiagnostics,
  FallbackReason,
  ActivityProvider,
} from "../types";
export const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  "missing-key": "Ticketmaster is not configured on this server.",
  "api-error": "Ticketmaster could not be reached or rejected the request.",
  timeout: "Ticketmaster did not respond within the time limit.",
  "malformed-response": "Ticketmaster returned an invalid response.",
  "no-results":
    "Ticketmaster returned no events for this city and time window.",
  "unusable-data":
    "Ticketmaster returned events, but none could be normalized safely.",
};
const EMPTY_DIAGNOSTICS: SearchDiagnostics = {
  rawCount: 0,
  normalizedCount: 0,
  duplicatesRemoved: 0,
  rejectedCount: 0,
  totalAvailable: null,
};
export async function searchActivities(
  p: Preferences,
  options: {
    provider?: TicketmasterProvider;
    mock?: ActivityProvider;
    allowMockFallback?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  let reason: FallbackReason;
  let diagnostics = { ...EMPTY_DIAGNOSTICS };
  try {
    const result = await (
      options.provider ?? new TicketmasterProvider()
    ).searchDetailed(p, signal);
    diagnostics = result.diagnostics;
    if (result.activities.length)
      return {
        ...result,
        dataMode: "live",
        reason: null,
        message:
          "Live data · Ticketmaster. Missing fields and estimates are shown explicitly.",
      };
    reason = diagnostics.rawCount ? "unusable-data" : "no-results";
  } catch (error) {
    if (signal?.aborted)
      throw new DOMException("Request aborted", "AbortError");
    reason = error instanceof TicketmasterError ? error.reason : "api-error";
  }
  if (options.allowMockFallback) {
    const activities = await (options.mock ?? mockProvider).search(p, signal);
    if (activities.length)
      return {
        activities,
        dataMode: "mock",
        reason,
        diagnostics,
        message: `Mock data · ${FALLBACK_MESSAGES[reason]} Showing fictional London demo plans, not live listings.`,
      };
  }
  return {
    activities: [],
    dataMode: reason === "no-results" ? "live" : "unavailable",
    reason,
    diagnostics,
    message: FALLBACK_MESSAGES[reason],
  };
}
