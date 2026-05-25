import { jaroWinkler, similarity, isPrefix } from "./fuzzyNameMatcher";

/**
 * Calculates a match score specifically tuned for task titles.
 * Returns a value between 0.0 and 1.0.
 */
export function taskMatchScore(candidate: string, query: string): number {
  const a = candidate.toLowerCase();
  const b = query.toLowerCase();

  if (a === b) return 1.0;

  const scores: number[] = [];

  // Prefix matching (e.g. "backend" matching "backend testing")
  if (isPrefix(a, b, 3)) {
    const coverage = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    scores.push(0.70 + coverage * 0.25); // Range: 0.70 - 0.95
  }

  // Jaro-Winkler boosts prefix matches heavily, great for transcription typos
  scores.push(jaroWinkler(a, b));

  // Basic Levenshtein similarity
  scores.push(similarity(a, b));

  return Math.max(...scores);
}
