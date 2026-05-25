import { nameMatchScore, isPrefix } from "../utils/fuzzyNameMatcher";
import { normalizeForComparison } from "../utils/normalizeTranscript";
import type { User } from "../context/AppContext";

export interface UserCandidate {
  user: User;
  confidence: number;
  strategy: "exact" | "alias" | "first_name" | "last_name" | "partial" | "prefix" | "fuzzy";
}

export interface ResolutionResult {
  user: User | null;
  candidates: UserCandidate[];
  ambiguous: boolean;
  clarification?: string;
}

const MIN_CONFIDENCE = 0.65;
const AMBIGUITY_THRESHOLD = 0.10;
const FUZZY_TOKEN_THRESHOLD = 0.75;

/**
 * Resolves a cleanly extracted raw name (e.g. from an AI intent extractor)
 * to a specific User in the system.
 *
 * Implements a prioritized matching pipeline:
 * 1. Exact full name
 * 2. Exact alias
 * 3. First name exact
 * 4. Last name exact
 * 5. Prefix (nickname)
 * 6. Partial token coverage
 * 7. Fuzzy matching
 */
export function resolveUserFromName(rawName: string, users: User[]): ResolutionResult {
  if (!rawName || !rawName.trim()) {
    return { user: null, candidates: [], ambiguous: false };
  }

  const queryNorm = normalizeForComparison(rawName);
  if (!queryNorm) {
    return { user: null, candidates: [], ambiguous: false };
  }

  const candidates: UserCandidate[] = [];

  for (const user of users) {
    const candidate = scoreUserMatch(queryNorm, user);
    if (candidate && candidate.confidence >= MIN_CONFIDENCE) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return { user: null, candidates: [], ambiguous: false, clarification: `Could not find a user named "${rawName}".` };
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  const top = candidates[0];
  const second = candidates.length > 1 ? candidates[1] : null;

  // Detect dangerous ambiguity
  // If the top match is highly confident (>0.95), we trust it.
  // Otherwise, if the difference between top 1 and top 2 is small, ask for clarification.
  const ambiguous =
    second !== null &&
    top.confidence < 0.95 &&
    (top.confidence - second.confidence) < AMBIGUITY_THRESHOLD;

  if (ambiguous) {
    // Collect all candidates that are very close to the top match
    const ambiguousCandidates = candidates.filter(
      (c) => top.confidence - c.confidence <= AMBIGUITY_THRESHOLD
    );
    const names = ambiguousCandidates.map((c) => c.user.name);
    return {
      user: null,
      candidates,
      ambiguous: true,
      clarification: `Did you mean ${names.join(" or ")}?`,
    };
  }

  return {
    user: top.user,
    candidates,
    ambiguous: false,
  };
}

function scoreUserMatch(queryNorm: string, user: User): UserCandidate | null {
  const userNorm = normalizeForComparison(user.name);
  if (!userNorm) return null;

  const queryTokens = queryNorm.split(/\s+/);
  const userTokens = userNorm.split(/\s+/);
  const firstName = userTokens[0];
  const lastName = userTokens.length > 1 ? userTokens[userTokens.length - 1] : null;

  // 1. Exact match
  if (queryNorm === userNorm) {
    return { user, confidence: 1.0, strategy: "exact" };
  }

  // 2. Alias match (We assume 'aliases' might be added to User in the future, 
  // or we can hardcode some based on first name if needed, but for now we look for user.aliases if it exists)
  // Casting to any to allow potential future 'aliases' property
  const aliases: string[] = (user as any).aliases || [];
  for (const alias of aliases) {
    const aliasNorm = normalizeForComparison(alias);
    if (queryNorm === aliasNorm) {
      return { user, confidence: 0.95, strategy: "alias" };
    }
  }

  // 3. First name exact match
  if (queryTokens.length === 1 && queryNorm === firstName) {
    return { user, confidence: 0.90, strategy: "first_name" };
  }

  // 4. Last name exact match
  if (lastName && queryTokens.length === 1 && queryNorm === lastName) {
    return { user, confidence: 0.85, strategy: "last_name" };
  }

  // 5. Prefix match (nicknames: "Adi" -> "Aditya")
  if (queryTokens.length === 1 && isPrefix(queryNorm, firstName, 3)) {
    const coverage = Math.min(queryNorm.length, firstName.length) / Math.max(queryNorm.length, firstName.length);
    return { user, confidence: 0.75 + (coverage * 0.15), strategy: "prefix" }; // 0.75 - 0.90
  }

  // 6. Partial match (Multi-token match where query covers user tokens)
  if (queryTokens.length > 1) {
    const matchingTokens = queryTokens.filter(qt => 
      userTokens.some(ut => ut === qt || ut.startsWith(qt) || nameMatchScore(ut, qt) >= FUZZY_TOKEN_THRESHOLD)
    );
    if (matchingTokens.length === queryTokens.length) {
      const coverage = matchingTokens.length / userTokens.length;
      return { user, confidence: 0.80 + (coverage * 0.15), strategy: "partial" };
    }
  }

  // 7. Fuzzy match
  const firstNameFuzzy = nameMatchScore(firstName, queryNorm);
  const fullNameFuzzy = nameMatchScore(userNorm, queryNorm);
  const bestFuzzy = Math.max(firstNameFuzzy, fullNameFuzzy);

  if (bestFuzzy >= FUZZY_TOKEN_THRESHOLD) {
    return { user, confidence: bestFuzzy * 0.85, strategy: "fuzzy" };
  }

  // 8. Token-level fuzzy match (single token)
  if (queryTokens.length === 1) {
    for (const ut of userTokens) {
      const score = nameMatchScore(ut, queryNorm);
      if (score >= FUZZY_TOKEN_THRESHOLD) {
        return { user, confidence: score * 0.80, strategy: "fuzzy" };
      }
    }
  }

  return null;
}
