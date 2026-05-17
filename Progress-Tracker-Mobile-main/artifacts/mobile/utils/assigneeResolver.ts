/**
 * assigneeResolver — Production entity resolution for voice command assignees.
 *
 * This module replaces the previous rigid regex-based extraction with a
 * multi-strategy, token-based assignee resolution pipeline.
 *
 * Architecture:
 * 1. extractAssigneeByPattern  — Token-based extraction from natural phrases
 * 2. resolveAssigneeFromUsers  — Fuzzy matching against known user list
 * 3. Combined pipeline with confidence scoring and ambiguity detection
 *
 * Design principles:
 * - No single rigid regex: uses multiple overlapping extraction strategies
 * - Token-based parsing with phrase windows
 * - Fuzzy matching with confidence thresholds
 * - Ambiguity detection (multiple Rahuls, etc.)
 * - Safe: never assigns the wrong user aggressively
 */

import { nameMatchScore, isPrefix } from "./fuzzyNameMatcher";
import { normalizeForComparison, stripHonorifics } from "./normalizeTranscript";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KnownUser {
  name: string;
  /** Optional nickname aliases for the user (e.g., "Adi" for "Aditya") */
  aliases?: string[];
}

export interface AssigneeCandidate {
  /** The matched user's full name */
  name: string;
  /** Confidence score 0.0-1.0 */
  confidence: number;
  /** Which matching strategy produced this match */
  strategy: "exact" | "first_name" | "last_name" | "partial" | "alias" | "fuzzy";
  /** The raw text fragment that was matched */
  matchedFragment: string;
}

export interface AssigneeResolutionResult {
  /** Best candidate, or null if no confident match */
  assignee: string | null;
  /** All candidates sorted by confidence (descending) */
  candidates: AssigneeCandidate[];
  /** Whether the result is ambiguous (multiple high-confidence matches) */
  ambiguous: boolean;
  /** Human-readable clarification prompt if ambiguous */
  clarificationPrompt?: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

/** Minimum confidence to accept a match */
const MIN_CONFIDENCE = 0.60;

/** Minimum confidence difference between top two candidates to be unambiguous */
const AMBIGUITY_THRESHOLD = 0.10;

/** Minimum fuzzy score for token-level matching */
const FUZZY_TOKEN_THRESHOLD = 0.75;

// ─── Trigger Phrases ────────────────────────────────────────────────────────

/**
 * Phrases that introduce an assignee name in natural speech.
 * Ordered from most specific to most general.
 */
const ASSIGNEE_TRIGGERS = [
  "create task for",
  "create a task for",
  "assign task to",
  "assign to",
  "assigned to",
  "task for",
  "task to",
  "give to",
  "give the",
  "give it to",
  "share with",
  "send to",
  "notify",
  "tell",
  "for",
  "to",
] as const;

/**
 * Stop words that typically follow an assignee name.
 * These terminate the name extraction window.
 */
const STOP_WORDS = new Set([
  "to", "by", "due", "on", "before", "with", "and", "then",
  "send", "notify", "share", "via", "whatsapp",
  "task", "tasks", "priority", "status",
  "high", "medium", "low", "critical", "urgent",
  "open", "done", "completed", "in", "blocked", "cancelled",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "tomorrow", "today", "next",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
]);

/**
 * Words that are definitely NOT names — task-related vocabulary.
 */
const NON_NAME_WORDS = new Set([
  "task", "tasks", "create", "add", "new", "make", "assign", "assigned",
  "update", "mark", "set", "change", "move", "reschedule", "shift", "push",
  "send", "notify", "share", "message", "text",
  "high", "medium", "low", "critical", "urgent",
  "priority", "status", "done", "completed", "complete", "finished",
  "open", "blocked", "cancelled", "active", "started",
  "report", "testing", "backend", "frontend", "deployment", "integration",
  "work", "the", "a", "an", "this", "that", "it", "is", "are", "was",
  "whatsapp", "filter", "show", "all", "clear", "reset",
]);

// ─── Pattern-Based Extraction ───────────────────────────────────────────────

/**
 * Extract potential assignee name from natural language text using
 * trigger-phrase detection and token windowing.
 *
 * Unlike the old regex approach, this:
 * - Uses multiple overlapping trigger phrases
 * - Does not limit name to 3 words
 * - Supports hyphens, apostrophes, and Unicode characters in names
 * - Handles punctuation-less transcripts
 * - Supports flexible word ordering
 *
 * @returns Array of potential name fragments (not yet matched to users)
 */
export function extractAssigneeFragments(text: string): string[] {
  const cleaned = stripHonorifics(text);
  const lower = cleaned.toLowerCase();
  const tokens = cleaned.split(/\s+/);
  const lowerTokens = lower.split(/\s+/);
  const fragments: string[] = [];

  // Strategy 1: Trigger-phrase extraction
  for (const trigger of ASSIGNEE_TRIGGERS) {
    const triggerWords = trigger.split(/\s+/);
    const triggerLen = triggerWords.length;

    // Find trigger phrase in tokens
    for (let i = 0; i <= lowerTokens.length - triggerLen; i++) {
      const segment = lowerTokens.slice(i, i + triggerLen).join(" ");
      if (segment !== trigger) continue;

      // Extract name tokens after the trigger
      const nameStart = i + triggerLen;
      if (nameStart >= tokens.length) continue;

      const nameTokens: string[] = [];
      for (let j = nameStart; j < tokens.length && nameTokens.length < 5; j++) {
        const word = lowerTokens[j];

        // Stop at known stop words (but only after collecting at least one token)
        if (nameTokens.length > 0 && STOP_WORDS.has(word)) break;

        // Stop at non-name words (unless it's the first token — could be a name collision)
        if (nameTokens.length > 0 && NON_NAME_WORDS.has(word)) break;

        // Stop if the token looks like a date or number
        if (/^\d+/.test(word)) break;

        // Collect the token (use original casing from tokens[])
        nameTokens.push(tokens[j]);
      }

      if (nameTokens.length > 0) {
        fragments.push(nameTokens.join(" "));
      }
    }
  }

  // Strategy 2: Bare name detection for minimal commands
  // e.g., "create task rahul friday high priority"
  if (fragments.length === 0) {
    // Look for capitalized words that aren't command keywords
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const lowerToken = lowerTokens[i];

      // Skip command/stop/non-name words
      if (NON_NAME_WORDS.has(lowerToken)) continue;
      if (STOP_WORDS.has(lowerToken)) continue;

      // Token looks like a potential name (starts with uppercase or is entirely lowercase in STT output)
      const isCapitalized = /^[A-Z\u00C0-\u024F\u0900-\u097F]/.test(token);
      const isAlphaOnly = /^[a-zA-Z\u00C0-\u024F\u0900-\u097F'\u002D]+$/.test(token);

      if (isAlphaOnly && (isCapitalized || token.length >= 3)) {
        // Collect consecutive name-like tokens
        const nameTokens: string[] = [token];
        for (let j = i + 1; j < tokens.length && nameTokens.length < 4; j++) {
          const next = lowerTokens[j];
          if (NON_NAME_WORDS.has(next) || STOP_WORDS.has(next) || /^\d/.test(next)) break;
          if (!/^[a-zA-Z\u00C0-\u024F\u0900-\u097F'\u002D]+$/.test(tokens[j])) break;
          nameTokens.push(tokens[j]);
        }
        fragments.push(nameTokens.join(" "));
      }
    }
  }

  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  return fragments.filter(f => {
    const key = f.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── User Matching ──────────────────────────────────────────────────────────

/**
 * Score how well a candidate name fragment matches a known user.
 *
 * Matching strategies (in priority order):
 * 1. Exact full name match → 1.0
 * 2. First name exact match → 0.90
 * 3. Last name exact match → 0.85
 * 4. Alias exact match → 0.92
 * 5. Multi-token partial match → 0.80
 * 6. Prefix match (nickname) → 0.75-0.85
 * 7. Fuzzy match → varies
 */
function scoreUserMatch(
  fragment: string,
  user: KnownUser,
): AssigneeCandidate | null {
  const fragNorm = normalizeForComparison(fragment);
  const userNorm = normalizeForComparison(user.name);

  if (!fragNorm || !userNorm) return null;

  const fragTokens = fragNorm.split(/\s+/);
  const userTokens = userNorm.split(/\s+/);
  const firstName = userTokens[0];
  const lastName = userTokens.length > 1 ? userTokens[userTokens.length - 1] : null;

  // 1. Exact full name
  if (fragNorm === userNorm) {
    return {
      name: user.name,
      confidence: 1.0,
      strategy: "exact",
      matchedFragment: fragment,
    };
  }

  // 2. Alias exact match
  if (user.aliases) {
    for (const alias of user.aliases) {
      const aliasNorm = normalizeForComparison(alias);
      if (fragNorm === aliasNorm) {
        return {
          name: user.name,
          confidence: 0.92,
          strategy: "alias",
          matchedFragment: fragment,
        };
      }
      // Alias fuzzy match
      const aliasScore = nameMatchScore(aliasNorm, fragNorm);
      if (aliasScore >= 0.85) {
        return {
          name: user.name,
          confidence: aliasScore * 0.90,
          strategy: "alias",
          matchedFragment: fragment,
        };
      }
    }
  }

  // 3. First name exact match
  if (fragTokens.length === 1 && fragNorm === firstName) {
    return {
      name: user.name,
      confidence: 0.90,
      strategy: "first_name",
      matchedFragment: fragment,
    };
  }

  // 4. Last name exact match
  if (lastName && fragTokens.length === 1 && fragNorm === lastName) {
    return {
      name: user.name,
      confidence: 0.85,
      strategy: "last_name",
      matchedFragment: fragment,
    };
  }

  // 5. Multi-token partial match (e.g., "Rahul Kumar" matches "Rahul Kumar Singh")
  if (fragTokens.length > 1) {
    const matchingTokens = fragTokens.filter(ft =>
      userTokens.some(ut => ut === ft || nameMatchScore(ut, ft) >= FUZZY_TOKEN_THRESHOLD),
    );
    if (matchingTokens.length === fragTokens.length) {
      const coverage = matchingTokens.length / userTokens.length;
      return {
        name: user.name,
        confidence: 0.70 + coverage * 0.25, // 0.70-0.95
        strategy: "partial",
        matchedFragment: fragment,
      };
    }
  }

  // 6. Prefix match (nickname: "Adi" → "Aditya", "Rah" → "Rahul")
  if (fragTokens.length === 1) {
    if (isPrefix(fragNorm, firstName, 3)) {
      const coverage = Math.min(fragNorm.length, firstName.length) / Math.max(fragNorm.length, firstName.length);
      return {
        name: user.name,
        confidence: 0.70 + coverage * 0.20, // 0.70-0.90
        strategy: "fuzzy",
        matchedFragment: fragment,
      };
    }
  }

  // 7. Fuzzy matching against first name and full name
  const firstNameScore = nameMatchScore(firstName, fragNorm);
  const fullNameScore = nameMatchScore(userNorm, fragNorm);
  const bestFuzzy = Math.max(firstNameScore, fullNameScore);

  if (bestFuzzy >= FUZZY_TOKEN_THRESHOLD) {
    return {
      name: user.name,
      confidence: bestFuzzy * 0.85, // Scale down fuzzy to prevent over-confidence
      strategy: "fuzzy",
      matchedFragment: fragment,
    };
  }

  // 8. Token-level fuzzy: check if any fragment token fuzzy-matches any user token
  if (fragTokens.length === 1) {
    for (const ut of userTokens) {
      const score = nameMatchScore(ut, fragNorm);
      if (score >= 0.80) {
        return {
          name: user.name,
          confidence: score * 0.80,
          strategy: "fuzzy",
          matchedFragment: fragment,
        };
      }
    }
  }

  return null;
}

// ─── Main Resolution Pipeline ───────────────────────────────────────────────

/**
 * Resolve assignee from command text against a list of known users.
 *
 * Pipeline:
 * 1. Extract name fragments from text using trigger phrases
 * 2. Score each fragment against each user
 * 3. Rank candidates by confidence
 * 4. Detect ambiguity
 * 5. Return best match or clarification prompt
 */
export function resolveAssignee(
  text: string,
  users: KnownUser[],
): AssigneeResolutionResult {
  if (!text || users.length === 0) {
    return { assignee: null, candidates: [], ambiguous: false };
  }

  const fragments = extractAssigneeFragments(text);
  const allCandidates: AssigneeCandidate[] = [];

  // Score each fragment against each user
  for (const fragment of fragments) {
    for (const user of users) {
      const candidate = scoreUserMatch(fragment, user);
      if (candidate && candidate.confidence >= MIN_CONFIDENCE) {
        allCandidates.push(candidate);
      }
    }
  }

  // If no fragments found from pattern extraction, try direct token matching
  // against user names in the full text (fallback for minimal commands)
  if (allCandidates.length === 0) {
    const textNorm = normalizeForComparison(stripHonorifics(text));
    for (const user of users) {
      const userNorm = normalizeForComparison(user.name);
      const userTokens = userNorm.split(/\s+/);
      const firstName = userTokens[0];

      // Check if first name appears anywhere in the text
      if (firstName && firstName.length >= 3) {
        const textTokens = textNorm.split(/\s+/);
        for (const tt of textTokens) {
          if (NON_NAME_WORDS.has(tt) || STOP_WORDS.has(tt)) continue;

          const score = nameMatchScore(firstName, tt);
          if (score >= 0.80) {
            allCandidates.push({
              name: user.name,
              confidence: score * 0.80,
              strategy: "fuzzy",
              matchedFragment: tt,
            });
          }
        }
      }

      // Check aliases in fallback too
      if (user.aliases) {
        const textTokens = textNorm.split(/\s+/);
        for (const alias of user.aliases) {
          const aliasNorm = normalizeForComparison(alias);
          for (const tt of textTokens) {
            if (NON_NAME_WORDS.has(tt) || STOP_WORDS.has(tt)) continue;
            const score = nameMatchScore(aliasNorm, tt);
            if (score >= 0.80) {
              allCandidates.push({
                name: user.name,
                confidence: score * 0.85,
                strategy: "alias",
                matchedFragment: tt,
              });
            }
          }
        }
      }
    }
  }

  if (allCandidates.length === 0) {
    return { assignee: null, candidates: [], ambiguous: false };
  }

  // Deduplicate: keep the highest-confidence match per user
  const bestPerUser = new Map<string, AssigneeCandidate>();
  for (const c of allCandidates) {
    const existing = bestPerUser.get(c.name);
    if (!existing || c.confidence > existing.confidence) {
      bestPerUser.set(c.name, c);
    }
  }

  const ranked = Array.from(bestPerUser.values())
    .sort((a, b) => b.confidence - a.confidence);

  // Check for ambiguity
  const top = ranked[0];
  const second = ranked.length > 1 ? ranked[1] : null;

  const ambiguous = second !== null &&
    top.confidence - second.confidence < AMBIGUITY_THRESHOLD &&
    top.confidence < 0.95; // High-confidence matches are never ambiguous

  if (ambiguous) {
    const names = ranked
      .filter(c => c.confidence >= MIN_CONFIDENCE)
      .map(c => c.name);
    return {
      assignee: null,
      candidates: ranked,
      ambiguous: true,
      clarificationPrompt: `Did you mean ${names.join(" or ")}?`,
    };
  }

  return {
    assignee: top.confidence >= MIN_CONFIDENCE ? top.name : null,
    candidates: ranked,
    ambiguous: false,
  };
}

/**
 * Legacy-compatible wrapper: extract assignee name by pattern.
 * Returns the raw name fragment (not matched to a user).
 */
export function extractAssigneeByPattern(text: string): string | undefined {
  const fragments = extractAssigneeFragments(text);
  return fragments[0] ?? undefined;
}

/**
 * Legacy-compatible wrapper: extract assignee from known users.
 * Returns the matched user's full name.
 */
export function extractAssigneeFromKnownUsers(
  text: string,
  users: Array<{ name: string }>,
): string | undefined {
  const result = resolveAssignee(text, users);
  return result.assignee ?? undefined;
}
