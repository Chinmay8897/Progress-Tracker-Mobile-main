/**
 * fuzzyNameMatcher — Lightweight fuzzy string matching for name resolution.
 *
 * Implements Levenshtein distance and normalized similarity scoring
 * for matching user names from noisy speech-to-text transcripts.
 *
 * Key design decisions:
 * - No external dependencies (production-safe, low-latency)
 * - Bounded Levenshtein with early exit for performance
 * - Jaro-Winkler bonus for prefix matches (common in name variations)
 * - Configurable confidence thresholds to prevent false positives
 */

/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses Wagner-Fischer dynamic programming with O(min(m,n)) space.
 *
 * @param a First string
 * @param b Second string
 * @param maxDist Optional early-exit threshold. Returns maxDist+1 if exceeded.
 */
export function levenshtein(a: string, b: string, maxDist?: number): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for O(min(m,n)) space
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // If the length difference alone exceeds maxDist, bail early
  if (maxDist !== undefined && Math.abs(aLen - bLen) > maxDist) {
    return maxDist + 1;
  }

  // Single-row DP
  const row = new Array<number>(aLen + 1);
  for (let i = 0; i <= aLen; i++) row[i] = i;

  for (let j = 1; j <= bLen; j++) {
    let prev = row[0];
    row[0] = j;
    let rowMin = row[0];

    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(
        row[i] + 1,       // deletion
        row[i - 1] + 1,   // insertion
        prev + cost,       // substitution
      );
      prev = row[i];
      row[i] = val;
      if (val < rowMin) rowMin = val;
    }

    // Early exit if every cell in this row exceeds maxDist
    if (maxDist !== undefined && rowMin > maxDist) {
      return maxDist + 1;
    }
  }

  return row[aLen];
}

/**
 * Compute normalized similarity score between two strings.
 * Returns a value between 0.0 (completely different) and 1.0 (identical).
 *
 * Uses Levenshtein distance normalized by the longer string length.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(a, b);
  return 1.0 - dist / maxLen;
}

/**
 * Jaro similarity between two strings.
 * Gives higher weight to prefix matches, which is valuable for name matching
 * ("Adi" → "Aditya" should score higher than "tya" → "Aditya").
 */
export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);

  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - matchWindow);
    const hi = Math.min(b.length - 1, i + matchWindow);

    for (let j = lo; j <= hi; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    matches / a.length +
    matches / b.length +
    (matches - transpositions / 2) / matches
  ) / 3;
}

/**
 * Jaro-Winkler similarity (boosts prefix matches).
 * Particularly effective for name matching where the first few characters
 * are typically correct even in noisy STT output.
 */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(a, b);

  // Count common prefix (up to 4 characters)
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(a.length, b.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * prefixScale * (1 - jaro);
}

/**
 * Check if string `a` is a prefix of string `b` (or vice versa).
 * Minimum prefix length of 3 to avoid false positives.
 */
export function isPrefix(a: string, b: string, minLength = 3): boolean {
  if (a.length < minLength && b.length < minLength) return false;
  return b.startsWith(a) || a.startsWith(b);
}

/**
 * Combined name matching score that blends multiple strategies.
 *
 * Strategy weights:
 * - Exact match: 1.0
 * - Prefix match (≥3 chars): 0.85
 * - Jaro-Winkler: raw score
 * - Levenshtein similarity: raw score
 *
 * Returns the maximum of all strategies.
 */
export function nameMatchScore(candidate: string, query: string): number {
  const a = candidate.toLowerCase();
  const b = query.toLowerCase();

  if (a === b) return 1.0;

  const scores: number[] = [];

  // Prefix matching (very common for nicknames: "Adi" → "Aditya")
  if (isPrefix(a, b, 3)) {
    // Score based on what fraction of the longer name is covered
    const coverage = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    scores.push(0.75 + coverage * 0.2); // Range: 0.75-0.95
  }

  // Jaro-Winkler (good for transposition errors)
  scores.push(jaroWinkler(a, b));

  // Levenshtein similarity (good for typo tolerance)
  scores.push(similarity(a, b));

  return Math.max(...scores);
}
