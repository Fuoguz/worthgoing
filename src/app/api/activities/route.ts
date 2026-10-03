import { searchActivities } from "@/lib/providers/search-service";
import { parsePreferences, validatePreferences } from "@/lib/preferences";
import { matchSearchInterests } from "@/lib/interests/semantic";
export const runtime = "nodejs";
// Allow the existing 8s retrieval + 60s embeddings deadline to finish on Vercel.
export const maxDuration = 90;
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const body = await request.text();
    if (body.length > 10000)
      return Response.json(
        { error: "Preferences are too large." },
        { status: 400, headers },
      );
    const p = parsePreferences(body, false);
    if (!p)
      return Response.json(
        { error: "Please check your activity preferences." },
        { status: 400, headers },
      );
    const issue = validatePreferences(p);
    if (issue) return Response.json({ error: issue }, { status: 400, headers });
    const result = await searchActivities(
      p,
      { allowMockFallback: process.env.NODE_ENV === "development" },
      request.signal,
    );
    return Response.json(
      await matchSearchInterests(result, p, request.signal),
      { headers },
    );
  } catch {
    return Response.json(
      {
        error: "Activity search is temporarily unavailable. Please try again.",
      },
      { status: 503, headers },
    );
  }
}
