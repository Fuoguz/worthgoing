/** Standard cosine, independent of whether the upstream vectors are normalized. */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number | null {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    !a.length ||
    a.length !== b.length ||
    !a.every(Number.isFinite) ||
    !b.every(Number.isFinite)
  )
    return null;
  const na = Math.hypot(...a),
    nb = Math.hypot(...b);
  if (!na || !nb || !Number.isFinite(na) || !Number.isFinite(nb)) return null;
  const cosine = a.reduce((sum, v, i) => sum + (v / na) * (b[i] / nb), 0);
  return Number.isFinite(cosine) ? Math.max(-1, Math.min(1, cosine)) : null;
}

// Measured examples in docs/deapi-calibration.json: low 0.346–0.395,
// medium 0.602, high 0.645–0.752. Conservative, monotonic, not a probability.
export const INTEREST_MAPPING_ID = "bge-m3-calibration-v1";
export const INTEREST_ANCHORS = [
  [0.4, 0],
  [0.6, 50],
  [0.75, 90],
  [1, 100],
] as const;
export function similarityToInterestFit(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0;
  if (similarity <= INTEREST_ANCHORS[0][0]) return 0;
  for (let i = 1; i < INTEREST_ANCHORS.length; i++) {
    const [lo, lowScore] = INTEREST_ANCHORS[i - 1];
    const [hi, highScore] = INTEREST_ANCHORS[i];
    if (similarity <= hi)
      return Math.round(
        lowScore + ((similarity - lo) / (hi - lo)) * (highScore - lowScore),
      );
  }
  return 100;
}
