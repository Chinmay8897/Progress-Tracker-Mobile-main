import { taskMatchScore } from "./fuzzyTaskMatcher";
import { normalizeForComparison } from "./normalizeTranscript";
import type { Task } from "@/context/AppContext";

export interface TaskCandidate {
  task: Task;
  confidence: number;
  strategy: "exact" | "contains" | "partial_tokens" | "fuzzy";
}

const FUZZY_TOKEN_THRESHOLD = 0.75;

/**
 * Scores a task against a parsed query title.
 * 
 * Strategy priority:
 * 1. Exact Match -> 1.0
 * 2. Contains Match -> 0.85 - 0.95 (depending on coverage)
 * 3. Partial Tokens Match -> 0.70 - 0.95 (e.g. "backend test" covering 2 of 3 tokens in "backend testing integration")
 * 4. Fuzzy Match -> scaled similarity score
 */
export function scoreTaskMatch(queryNorm: string, task: Task): TaskCandidate | null {
  const taskNorm = normalizeForComparison(task.title);
  if (!taskNorm) return null;

  // 1. Exact Match
  if (queryNorm === taskNorm) {
    return { task, confidence: 1.0, strategy: "exact" };
  }

  // 2. Contains Match (Query is fully contained in task title)
  if (taskNorm.includes(queryNorm)) {
    const coverage = queryNorm.length / taskNorm.length;
    return { task, confidence: 0.85 + (coverage * 0.10), strategy: "contains" };
  }

  // Reverse Contains (Task title is fully contained in query)
  if (queryNorm.includes(taskNorm)) {
    const coverage = taskNorm.length / queryNorm.length;
    return { task, confidence: 0.80 + (coverage * 0.10), strategy: "contains" };
  }

  const queryTokens = queryNorm.split(/\s+/);
  const taskTokens = taskNorm.split(/\s+/);

  // 3. Partial Token Match
  // E.g., query "backend test" -> matches "backend", "testing" from "backend testing integration"
  if (queryTokens.length > 0) {
    const matchingTokens = queryTokens.filter(qt => 
      taskTokens.some(tt => tt === qt || tt.startsWith(qt) || taskMatchScore(tt, qt) >= FUZZY_TOKEN_THRESHOLD)
    );

    // If every token in the query strongly matches a token in the task
    if (matchingTokens.length === queryTokens.length) {
      const coverage = matchingTokens.length / taskTokens.length;
      return { task, confidence: 0.80 + (coverage * 0.15), strategy: "partial_tokens" };
    }
  }

  // 4. Fuzzy Match
  const bestFuzzy = taskMatchScore(taskNorm, queryNorm);
  if (bestFuzzy >= FUZZY_TOKEN_THRESHOLD) {
    return { task, confidence: bestFuzzy * 0.85, strategy: "fuzzy" };
  }

  return null;
}
