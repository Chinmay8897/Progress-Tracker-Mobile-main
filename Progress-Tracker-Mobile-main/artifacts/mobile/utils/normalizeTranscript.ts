/**
 * normalizeTranscript — Clean up on-device speech recognition output.
 *
 * Device STT engines (Apple Speech Framework, Google Speech Services)
 * produce text with inconsistent formatting:
 * - Missing/extra punctuation
 * - Random capitalization
 * - Filler words ("um", "uh", "like")
 * - Leading/trailing whitespace
 * - Double spaces
 *
 * This utility normalizes the transcript before it reaches the parser.
 */

const FILLER_WORDS = /\b(?:um+|uh+|ah+|er+|hmm+|like|you know|I mean|so basically|okay so|well)\b/gi;

/**
 * Normalize a raw speech recognition transcript for command parsing.
 *
 * - Strips filler words
 * - Collapses whitespace
 * - Trims leading/trailing spaces
 */
export function normalizeTranscript(raw: string): string {
  if (!raw) return "";

  let cleaned = raw
    // Remove filler words
    .replace(FILLER_WORDS, " ")
    // Remove trailing punctuation that speech engines sometimes add
    .replace(/[.!?]+$/g, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Trim
    .trim();

  return cleaned;
}

/**
 * Check if a transcript contains enough meaningful content to parse.
 * Returns false for empty, whitespace-only, or filler-only transcripts.
 */
export function isValidTranscript(raw: string): boolean {
  const normalized = normalizeTranscript(raw);
  // Must have at least 2 characters and at least one alphabetical character
  return normalized.length >= 2 && /[a-zA-Z]/.test(normalized);
}
