import "server-only";
import type { ActivityProvider, Preferences, FallbackReason } from "../types";
import { resolveSearchLocation } from "../location";
import { zonedToUtc } from "../time";
import {
  InvalidTicketmasterResponse,
  normalizeResponse,
} from "./ticketmaster-normalize";
export const TICKETMASTER_ENDPOINT =
  "https://app.ticketmaster.com/discovery/v2/events.json";
export class TicketmasterError extends Error {
  constructor(public reason: FallbackReason) {
    super(`Ticketmaster search unavailable (${reason}).`);
  }
}
export function queryParameters(p: Preferences): URLSearchParams {
  const location = resolveSearchLocation(p.location);
  const parameters = new URLSearchParams({
    city: location.city,
    size: "50",
    sort: "date,asc",
    source: "ticketmaster",
  });
  if (location.countryCode) parameters.set("countryCode", location.countryCode);
  const start = location.timezone
    ? zonedToUtc(p.date, p.startTime, location.timezone)
    : null;
  const end = location.timezone
    ? zonedToUtc(p.date, p.endTime, location.timezone)
    : null;
  if (start && end) {
    parameters.set("startDateTime", start);
    parameters.set("endDateTime", end);
  } else
    parameters.set(
      "localStartDateTime",
      `${p.date}T${p.startTime}:00,${p.date}T${p.endTime}:00`,
    );
  return parameters;
}
export class TicketmasterProvider implements ActivityProvider {
  id = "ticketmaster";
  constructor(
    private options: {
      apiKey?: string;
      fetcher?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {}
  async search(p: Preferences, signal?: AbortSignal) {
    return (await this.searchDetailed(p, signal)).activities;
  }
  async searchDetailed(p: Preferences, signal?: AbortSignal) {
    if (signal?.aborted)
      throw new DOMException("Request aborted", "AbortError");
    const apiKey = this.options.apiKey ?? process.env.TICKETMASTER_API_KEY;
    if (!apiKey?.trim()) throw new TicketmasterError("missing-key");
    const query = queryParameters(p);
    query.set("apikey", apiKey);
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 8000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await (this.options.fetcher ?? fetch)(
        `${TICKETMASTER_ENDPOINT}?${query}`,
        { signal: requestSignal, cache: "no-store", redirect: "error" },
      );
      if (!response.ok) throw new TicketmasterError("api-error");
      const raw: unknown = await response.json();
      if (signal?.aborted)
        throw new DOMException("Request aborted", "AbortError");
      return normalizeResponse(raw, p);
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Request aborted", "AbortError");
      if (timeout.aborted) throw new TicketmasterError("timeout");
      if (error instanceof TicketmasterError) throw error;
      if (
        error instanceof InvalidTicketmasterResponse ||
        error instanceof SyntaxError
      )
        throw new TicketmasterError("malformed-response");
      // Never expose fetch errors, request URLs, upstream bodies or API credentials.
      throw new TicketmasterError("api-error");
    }
  }
}
