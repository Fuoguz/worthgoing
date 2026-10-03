import type { Activity, Preferences } from "../types";

/** Formatting only: preserve the user's language, never translate or expand it. */
export function userInterestText(
  p: Pick<Preferences, "interests" | "interestText">,
): string {
  return `User interests:\n${[p.interests.join("; "), p.interestText?.trim()].filter(Boolean).join("\n")}`;
}
/** Only actual normalized Ticketmaster metadata; no derived interest tags or guessed facts. */
export function eventInterestText(a: Activity): string | null {
  if (a.source.isMock || a.source.name !== "Ticketmaster") return null;
  const fields: string[] = [`Title: ${a.title}`];
  if (a.classificationDetails?.length) {
    const labels = {
      segment: "Segment",
      genre: "Genre",
      subgenre: "Subgenre",
      type: "Type",
      subtype: "Subtype",
    } as const;
    for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
      const values = [
        ...new Set(a.classificationDetails.map((c) => c[key]).filter(Boolean)),
      ];
      if (values.length) fields.push(`${labels[key]}: ${values.join("; ")}`);
    }
  } else {
    if (a.classifications?.length)
      fields.push(`Classifications: ${a.classifications.join("; ")}`);
    if (a.genres?.length) fields.push(`Genres: ${a.genres.join("; ")}`);
  }
  if (a.description) fields.push(`Description: ${a.description}`);
  if (a.venue) fields.push(`Venue: ${a.venue}`);
  if (a.city) fields.push(`City: ${a.city}`);
  return fields.join("\n");
}
