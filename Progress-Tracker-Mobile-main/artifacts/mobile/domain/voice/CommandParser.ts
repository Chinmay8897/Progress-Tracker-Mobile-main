/**
 * CommandParser — Intent detection and entity extraction.
 *
 * Parses natural language text into a structured ParsedCommand.
 *
 * Supported intents:
 * - create_task  — "Create a task for Rahul to finish report by Friday"
 * - update_task  — "Mark testing task as completed"
 * - move_task    — "Move report task to May 20"
 * - send_whatsapp — "Send pending tasks to Rahul on WhatsApp"
 * - open_form    — "new task" / "create task" (bare, no details)
 * - set_filter   — "show critical" / "show done"
 * - clear_filters — "show all" / "clear filters"
 */

import type { Priority, TaskStatus } from "@/context/AppContext";
import type { ParsedCommand, ParsedEntities, ParserContext } from "./types";
import { findDeadlineInText } from "./DateParser";
import { normalizeTranscript, stripHonorifics } from "@/utils/normalizeTranscript";
import {
  extractAssigneeByPattern,
  extractAssigneeFromKnownUsers,
  resolveAssignee,
  type AssigneeResolutionResult,
} from "@/utils/assigneeResolver";

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(s: string): string {
  const v = s.trim();
  return v ? v[0].toUpperCase() + v.slice(1) : v;
}

// ─── Entity Extractors ─────────────────────────────────────────────────────

export function extractPriority(text: string): Priority | undefined {
  const l = text.toLowerCase();
  if (/\bcritical\b/.test(l)) return "critical";
  if (/\burgent\b/.test(l)) return "high";
  if (/\bhigh\s*[- ]?priority\b/.test(l) || (/\bwith\s+high\b/.test(l) && /\bpriority\b/.test(l))) return "high";
  if (/\bmedium\s*[- ]?priority\b/.test(l) || (/\bwith\s+medium\b/.test(l) && /\bpriority\b/.test(l))) return "medium";
  if (/\blow\s*[- ]?priority\b/.test(l) || (/\bwith\s+low\b/.test(l) && /\bpriority\b/.test(l))) return "low";
  return undefined;
}

export function extractStatus(text: string): TaskStatus | undefined {
  const l = text.toLowerCase();
  if (/\b(?:completed?|done|finished)\b/.test(l)) return "done";
  if (/\bin[\s_-]?progress\b/.test(l) || /\bactive\b/.test(l) || /\bstarted\b/.test(l)) return "in_progress";
  if (/\bblocked\b/.test(l)) return "blocked";
  if (/\bopen\b/.test(l) || /\bnot\s+started\b/.test(l)) return "open";
  if (/\bcancell?ed\b/.test(l)) return "cancelled";
  return undefined;
}

export function detectWhatsApp(text: string): boolean {
  const l = text.toLowerCase();
  if (!/\bwhats\s*app\b/.test(l)) return false;
  return /\b(send|notify|share|message|text)\b/.test(l) || /\b(?:on|via)\s+whats\s*app\b/.test(l);
}

// Re-export for backward compatibility
export { extractAssigneeByPattern, extractAssigneeFromKnownUsers };

function extractTaskTitle(
  raw: string,
  assignee?: string,
  deadlineSource?: string,
): string | undefined {
  // Strip honorifics for cleaner title extraction
  const cleaned0 = stripHonorifics(raw);

  // Pattern 1: "for <name> to <title> by ..."
  const forTo = cleaned0.match(
    /\bfor\s+\S+(?:\s+\S+){0,4}\s+to\s+(.+?)(?=\s+(?:by|due|on|before|with|and|send|notify|share|via)\b|$)/i,
  );
  if (forTo?.[1]) return forTo[1].trim();

  // Pattern 2: "task to <title> ..."
  const taskTo = cleaned0.match(
    /\btask\s+to\s+(.+?)(?=\s+(?:by|due|on|before|with|and|send|notify|share|via)\b|$)/i,
  );
  if (taskTo?.[1]) return taskTo[1].trim();

  // Pattern 3: "assign ... <title>"
  const assign = cleaned0.match(
    /\bassign(?:.*?\s+to\s+\S+(?:\s+\S+){0,4})?\s+(.+?)(?=\s+(?:by|due|on|before|with|and|send|notify|share|via)\b|$)/i,
  );
  if (assign?.[1]) return assign[1].trim();

  // Pattern 4: "tell <name> to <title>"
  const tell = cleaned0.match(
    /\btell\s+\S+(?:\s+\S+){0,3}\s+to\s+(.+?)(?=\s+(?:by|due|on|before|with|and|send|notify|share|via)\b|$)/i,
  );
  if (tell?.[1]) return tell[1].trim();

  // Pattern 5: "give the <title> task to ..."
  const giveThe = cleaned0.match(
    /\bgive\s+the\s+(.+?)\s+task\s+to\b/i,
  );
  if (giveThe?.[1]) return giveThe[1].trim();

  // Fallback: remove known segments and use what's left
  let cleaned = cleaned0;
  cleaned = cleaned.replace(/^\s*(please\s+)?(add|create|new|make)\s+(a\s+)?task\b\s*[:\-–,]?\s*/i, "");

  if (assignee) {
    // Remove the assignee name and surrounding trigger words
    const assigneeTokens = assignee.split(/\s+/).map(t => escapeRe(t));
    const namePattern = assigneeTokens.join("\\s+");
    const triggerRemoval = new RegExp(
      `\\b(?:for|assign(?:\\s+.*?)?\\s+to|assigned\\s+to|task\\s+to|tell|give\\s+to|give\\s+it\\s+to|share\\s+with)\\s+${namePattern}\\b`,
      "i",
    );
    cleaned = cleaned.replace(triggerRemoval, " ");
    // Also remove bare name
    cleaned = cleaned.replace(new RegExp(`\\b${namePattern}\\b`, "i"), " ");
  }

  if (deadlineSource) {
    cleaned = cleaned.replace(new RegExp(escapeRe(deadlineSource), "i"), " ");
  }

  cleaned = cleaned.replace(/\b(with\s+)?(critical|urgent|high|medium|low)\s*[- ]?priority\b/gi, " ");
  cleaned = cleaned.replace(/\b(send|notify|share)\b[^.]*?\bwhats\s*app\b/gi, " ");
  cleaned = cleaned.replace(/\b(?:and|then|please|it)\b/gi, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim().replace(/^\s*to\s+/i, "");

  return cleaned || undefined;
}

/** Extract task-title for update/move commands: "mark <title> as ..." / "move <title> to ..." */
function extractTargetTaskTitle(raw: string): string | undefined {
  // "mark <title> as ..."
  const mark = raw.match(/\b(?:mark|set|change)\s+(.+?)\s+(?:as|to)\s+/i);
  if (mark?.[1]) return mark[1].replace(/\b(the\s+)?task\b/gi, "").trim();

  // "move/reschedule <title> to ..."
  const move = raw.match(/\b(?:move|reschedule|shift|push)\s+(.+?)\s+(?:to|by)\s+/i);
  if (move?.[1]) return move[1].replace(/\b(the\s+)?task\b/gi, "").trim();

  return undefined;
}

// ─── Intent Detection ───────────────────────────────────────────────────────

function detectIntent(lower: string): string {
  // Update task
  if (/\b(mark|set|change)\b/.test(lower) && /\b(as|to)\s+(completed?|done|finished|in[\s_-]?progress|blocked|open|cancel)/i.test(lower)) {
    return "update_task";
  }

  // Move task
  if (/\b(move|reschedule|shift|push)\b/.test(lower) && /\b(to|by)\b/.test(lower)) {
    return "move_task";
  }

  // WhatsApp standalone (not attached to task creation)
  const hasWhatsApp = /\bwhats\s*app\b/.test(lower);
  const hasTaskCreate = /\b(add|create|new|make)\b/.test(lower) && /\btask\b/.test(lower);
  if (hasWhatsApp && !hasTaskCreate && /\b(send|notify|share|message)\b/.test(lower)) {
    return "send_whatsapp";
  }

  // Create/assign task
  const hasTask = /\btask\b/.test(lower);
  const hasCreate = /\b(add|create|new|make)\b/.test(lower);
  const hasAssign = /\bassign\b/.test(lower);
  const hasTell = /\btell\b/.test(lower);
  const hasGive = /\bgive\b/.test(lower);
  if ((hasTask && (hasCreate || hasAssign)) || (hasAssign && /\bto\b/.test(lower))) {
    return "create_task";
  }

  // "Tell <name> to ..." or "Give <name> ..." implies task creation
  if ((hasTell || hasGive) && /\bto\b/.test(lower)) {
    return "create_task";
  }

  // Bare "new task"
  if (/\b(new task|create task|add task|create a task)\b/.test(lower)) {
    return "open_form";
  }

  // Filters
  if (/\b(show all|clear|reset|all filters)\b/.test(lower)) return "clear_filters";
  if (/\bshow\b/.test(lower) || /\bfilter\b/.test(lower)) return "set_filter";

  return "unknown";
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export function parseCommand(text: string, ctx: ParserContext = {}): ParsedCommand {
  // Normalize device STT output: strip filler words, collapse whitespace, trim
  const rawText = normalizeTranscript(text);
  if (!rawText) return { intent: "unknown", rawText: text.trim(), entities: { sendWhatsApp: false } };

  const lower = rawText.toLowerCase();
  const now = ctx.now ?? new Date();
  const intentRaw = detectIntent(lower);

  // Bare "new task" → open form
  if (intentRaw === "create_task" && /^\s*(new|create|add)\s+(a\s+)?task\s*$/i.test(rawText)) {
    return { intent: "open_form", rawText, entities: { sendWhatsApp: false } };
  }

  const deadlineResult = findDeadlineInText(rawText, now);
  const deadline = deadlineResult?.dateKey;
  const priority = extractPriority(rawText);
  const status = extractStatus(rawText);
  const sendWhatsApp = detectWhatsApp(rawText);

  // ── Resolve assignee using the new multi-strategy pipeline ──
  let assigneeName: string | undefined;
  let assigneeResolution: AssigneeResolutionResult | undefined;

  if (ctx.knownUsers && ctx.knownUsers.length > 0) {
    // Full resolution pipeline: pattern extraction + user matching + fuzzy
    assigneeResolution = resolveAssignee(rawText, ctx.knownUsers);
    assigneeName = assigneeResolution.assignee ?? undefined;

    // Log ambiguity for diagnostics (structured log)
    if (assigneeResolution.ambiguous) {
      console.warn(
        `[CommandParser] Ambiguous assignee in: "${rawText}". ` +
        `Candidates: ${assigneeResolution.candidates.map(c => `${c.name}(${c.confidence.toFixed(2)})`).join(", ")}`,
      );
    }
  } else {
    // No known users: fall back to pattern-only extraction
    assigneeName = extractAssigneeByPattern(rawText);
  }

  // Build entities
  const entities: ParsedEntities = {
    assigneeName,
    deadline,
    priority,
    status,
    sendWhatsApp,
  };

  // Attach ambiguity info for downstream handling
  if (assigneeResolution?.ambiguous) {
    entities.assigneeAmbiguous = true;
    entities.assigneeClarification = assigneeResolution.clarificationPrompt;
    entities.assigneeCandidates = assigneeResolution.candidates.map(c => c.name);
  }

  switch (intentRaw) {
    case "create_task": {
      const title = extractTaskTitle(rawText, assigneeName, deadlineResult?.sourceText);
      entities.taskTitle = title ? capitalize(title) : undefined;
      return { intent: "create_task", rawText, entities };
    }

    case "update_task": {
      entities.taskTitle = extractTargetTaskTitle(rawText);
      return { intent: "update_task", rawText, entities };
    }

    case "move_task": {
      entities.taskTitle = extractTargetTaskTitle(rawText);
      return { intent: "move_task", rawText, entities };
    }

    case "send_whatsapp":
      return { intent: "send_whatsapp", rawText, entities };

    case "open_form":
      return { intent: "open_form", rawText, entities };

    case "clear_filters":
      return { intent: "clear_filters", rawText, entities };

    case "set_filter": {
      // Determine which filter
      if (/\bcritical\b/.test(lower)) {
        entities.filterType = "priority"; entities.filterValue = "critical";
      } else if (/\bhigh\b/.test(lower)) {
        entities.filterType = "priority"; entities.filterValue = "high";
      } else if (/\bmedium\b/.test(lower)) {
        entities.filterType = "priority"; entities.filterValue = "medium";
      } else if (/\blow\b/.test(lower)) {
        entities.filterType = "priority"; entities.filterValue = "low";
      } else if (/\bin[\s_-]?progress\b/.test(lower) || /\bactive\b/.test(lower)) {
        entities.filterType = "status"; entities.filterValue = "in_progress";
      } else if (/\bblocked\b/.test(lower)) {
        entities.filterType = "status"; entities.filterValue = "blocked";
      } else if (/\b(done|completed?|finished)\b/.test(lower)) {
        entities.filterType = "status"; entities.filterValue = "done";
      } else if (/\bopen\b/.test(lower)) {
        entities.filterType = "status"; entities.filterValue = "open";
      } else if (/\bcancell?ed\b/.test(lower)) {
        entities.filterType = "status"; entities.filterValue = "cancelled";
      }
      return { intent: "set_filter", rawText, entities };
    }

    default:
      return { intent: "unknown", rawText, entities };
  }
}
