import { scoreTaskMatch } from "../utils/taskMatcher";
import type { TaskCandidate } from "../utils/taskMatcher";
import { normalizeForComparison } from "../utils/normalizeTranscript";
import type { Task } from "@/context/AppContext";

export interface TaskResolutionResult {
  task: Task | null;
  candidates: TaskCandidate[];
  ambiguous: boolean;
  clarification?: string;
}

const MIN_CONFIDENCE = 0.65;
const AMBIGUITY_THRESHOLD = 0.10;

/**
 * Resolves a cleanly extracted raw task title (e.g. from an AI intent extractor)
 * to a specific Task in the system.
 */
export function resolveTaskFromTitle(rawTitle: string, tasks: Task[]): TaskResolutionResult {
  if (!rawTitle || !rawTitle.trim() || tasks.length === 0) {
    return { task: null, candidates: [], ambiguous: false };
  }

  const queryNorm = normalizeForComparison(rawTitle);
  if (!queryNorm) {
    return { task: null, candidates: [], ambiguous: false };
  }

  const candidates: TaskCandidate[] = [];

  for (const task of tasks) {
    const candidate = scoreTaskMatch(queryNorm, task);
    if (candidate && candidate.confidence >= MIN_CONFIDENCE) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return { 
      task: null, 
      candidates: [], 
      ambiguous: false, 
      clarification: `Could not find a task matching "${rawTitle}".` 
    };
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  const top = candidates[0];
  const second = candidates.length > 1 ? candidates[1] : null;

  // Detect dangerous ambiguity
  const ambiguous =
    second !== null &&
    top.confidence < 0.95 &&
    (top.confidence - second.confidence) < AMBIGUITY_THRESHOLD;

  if (ambiguous) {
    const ambiguousCandidates = candidates.filter(
      (c) => top.confidence - c.confidence <= AMBIGUITY_THRESHOLD
    );
    const names = ambiguousCandidates.map((c) => `"${c.task.title}"`);
    return {
      task: null,
      candidates,
      ambiguous: true,
      clarification: `Did you mean ${names.join(" or ")}?`,
    };
  }

  return {
    task: top.task,
    candidates,
    ambiguous: false,
  };
}
