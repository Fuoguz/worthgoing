import type { ActivityProvider, Preferences, SearchResult } from "../types";
class ServerActivityProvider implements ActivityProvider {
  id = "server-ticketmaster";
  async search(p: Preferences, signal?: AbortSignal) {
    return (await this.searchWithMetadata(p, signal)).activities;
  }
  async searchWithMetadata(
    p: Preferences,
    signal?: AbortSignal,
  ): Promise<SearchResult> {
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
      signal,
    });
    if (!response.ok)
      throw new Error("Activity search is unavailable. Please try again.");
    const result: SearchResult = await response.json();
    if (
      !result ||
      !Array.isArray(result.activities) ||
      !["live", "mock", "unavailable"].includes(result.dataMode)
    )
      throw new Error(
        "Activity search returned an invalid response. Please try again.",
      );
    return result;
  }
}
export const activityProvider = new ServerActivityProvider();
