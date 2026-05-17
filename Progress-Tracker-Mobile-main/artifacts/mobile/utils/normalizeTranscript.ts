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
 * - Repeated words from stuttering
 * - Accidental punctuation from auto-correct
 *
 * This utility normalizes the transcript before it reaches the parser.
 * Unicode-safe: does not strip non-ASCII alphabetical characters.
 */

/**
 * Filler words and STT noise patterns.
 * Ordered from longer phrases to shorter to avoid partial removal.
 */
const FILLER_PHRASES = /\b(?:so basically|you know|i mean|okay so|can you|could you|would you|i want you to|i need you to)\b/gi;
const FILLER_WORDS = /\b(?:um+|uh+|ah+|er+|hmm+|like|well|okay|ok|please|pls|plz|basically|actually|just|really|literally)\b/gi;

/**
 * Honorific/title patterns that often appear in Indian English speech.
 * We keep the name but strip the title for matching purposes.
 */
const HONORIFICS = /\b(?:mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?|sir|ma'?am|madam|ji|bhai|didi|bro)\b/gi;

/**
 * Normalize a raw speech recognition transcript for command parsing.
 *
 * Pipeline:
 * 1. Strip filler phrases (multi-word)
 * 2. Strip filler words (single-word)
 * 3. Remove trailing sentence punctuation
 * 4. Remove accidental internal punctuation (commas, semicolons)
 * 5. Collapse repeated words (stuttering: "the the" → "the")
 * 6. Collapse whitespace
 * 7. Trim
 */
export function normalizeTranscript(raw: string): string {
  if (!raw) return "";

  let cleaned = raw
    // Step 1: Remove multi-word filler phrases first
    .replace(FILLER_PHRASES, " ")
    // Step 2: Remove single filler words
    .replace(FILLER_WORDS, " ")
    // Step 3: Remove trailing punctuation that speech engines sometimes add
    .replace(/[.!?]+$/g, "")
    // Step 4: Remove accidental commas/semicolons (but preserve hyphens/apostrophes in names)
    .replace(/[,;:]+/g, " ")
    // Step 5: Collapse repeated words from stuttering ("the the" → "the")
    .replace(/\b(\w+)\s+\1\b/gi, "$1")
    // Step 6: Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Step 7: Trim
    .trim();

  return cleaned;
}

/**
 * Strip honorifics from text for name matching.
 * "Mr Rahul Kumar" → "Rahul Kumar"
 * "Rahul sir" → "Rahul"
 */
export function stripHonorifics(text: string): string {
  return text.replace(HONORIFICS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Normalize text for comparison: lowercase, strip punctuation except
 * hyphens and apostrophes (for names like O'Brien, Mary-Jane),
 * collapse whitespace.
 */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'\u002D\u2010-\u2015\u00C0-\u024F\u0900-\u097F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a transcript contains enough meaningful content to parse.
 * Returns false for empty, whitespace-only, or filler-only transcripts.
 */
export function isValidTranscript(raw: string): boolean {
  const normalized = normalizeTranscript(raw);
  // Must have at least 2 characters and at least one alphabetical character
  return normalized.length >= 2 && /[a-zA-Z\u00C0-\u024F\u0900-\u097F]/.test(normalized);
}
