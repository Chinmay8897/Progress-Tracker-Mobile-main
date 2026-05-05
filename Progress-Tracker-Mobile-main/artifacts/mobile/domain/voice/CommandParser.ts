import { Priority, TaskStatus } from "@/context/AppContext";
import { DateKey } from "@/utils/date";
import { findDeadlineInText } from "@/domain/voice/DateParser";

export interface ParsedTaskCommand {
  rawText: string;
  title?: string;
  assigneeName?: string;
  deadline?: DateKey;
  priority?: Priority;
  sendWhatsApp: boolean;
}

export type ParsedVoiceCommand =
  | { kind: "clear_filters"; rawText: string }
  | { kind: "set_priority_filter"; rawText: string; priority: Priority | "all" }
  | { kind: "set_status_filter"; rawText: string; status: TaskStatus | "all" }
  | { kind: "open_task_form"; rawText: string }
  | { kind: "create_task"; rawText: string; command: ParsedTaskCommand }
  | { kind: "unknown"; rawText: string };

export interface ParseVoiceCommandContext {
  now?: Date;
  /** Known user names to help extract assignee from free-form text. */
  knownUsers?: Array<{ name: string }>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalizeFirst(value: string): string {
  const v = value.trim();
  if (!v) return v;
  return v[0].toUpperCase() + v.slice(1);
}

function parseSendWhatsApp(lower: string): boolean {
  // Examples:
  // - "send it on WhatsApp"
  // - "notify via WhatsApp"
  // - "send on whatsapp"
  const hasWhatsApp = /\bwhats\s*app\b|\bwhatsapp\b/.test(lower);
  if (!hasWhatsApp) return false;

  const explicit =
    /\b(send|notify|share|message|text)\b/.test(lower) ||
    /\b(?:on|via)\s+(?:whats\s*app|whatsapp)\b/.test(lower);
  return explicit;
}

function parsePriority(lower: string): Priority | undefined {
  if (/\bcritical\b/.test(lower)) return "critical";
  if (/\burgent\b/.test(lower)) return "high";

  if (/\bhigh\s*[- ]?priority\b/.test(lower)) return "high";
  if (/\bmedium\s*[- ]?priority\b/.test(lower)) return "medium";
  if (/\blow\s*[- ]?priority\b/.test(lower)) return "low";

  // Slightly looser matches.
  if (/\bwith\s+high\b/.test(lower) && /\bpriority\b/.test(lower)) return "high";
  if (/\bwith\s+medium\b/.test(lower) && /\bpriority\b/.test(lower)) return "medium";
  if (/\bwith\s+low\b/.test(lower) && /\bpriority\b/.test(lower)) return "low";

  return undefined;
}

function findAssigneeByPatterns(rawText: string): string | undefined {
  // Prefer explicit patterns: "for Rahul" / "assign to Rahul"
  // Avoid swallowing "to complete" by using a lookahead boundary.
  const m = rawText.match(
    /\b(?:for|assign(?:\s+it)?\s+to|assigned\s+to)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})(?=\s+(?:to|by|due|on|before|with|and|send|notify|share|$))/i,
  );
  if (!m) return undefined;
  return m[1].trim();
}

function findAssigneeFromKnownUsers(lower: string, knownUsers: Array<{ name: string }>): string | undefined {
  // Score by longest match so "Rahul Sharma" wins over "Rahul".
  let best: { name: string; score: number } | null = null;

  for (const u of knownUsers) {
    const full = u.name.trim();
    if (!full) continue;

    const variants = new Set<string>();
    variants.add(full.toLowerCase());
    variants.add(full.split(/\s+/)[0]?.toLowerCase() ?? "");

    for (const v of variants) {
      if (!v) continue;
      const re = new RegExp(`\\b${escapeRegExp(v)}\\b`, "i");
      if (!re.test(lower)) continue;

      const score = v.length;
      if (!best || score > best.score) {
        best = { name: full, score };
      }
    }
  }

  return best?.name;
}

function extractTitleCandidate(rawText: string, assigneeName?: string, deadlineSourceText?: string): string | undefined {
  // 1) "... for Rahul to <title> by ..."
  const forTo = rawText.match(/\bfor\s+[a-zA-Z]+(?:\s+[a-zA-Z]+){0,2}\s+to\s+(.+?)(?=\s+(?:by|due|on|before|with|and|send|notify|share|via)\b|$)/i);
  if (forTo?.[1]) return forTo[1].trim();

  // 2) "... task to <title> ..."
  const taskTo = rawText.match(/\btask\s+to\s+(.+?)(?=\s+(?:by|due|on|before|with|and|send|notify|share|via)\b|$)/i);
  if (taskTo?.[1]) return taskTo[1].trim();

  // 3) "assign ... <title> ..." (optionally "assign to Rahul <title>")
  const assign = rawText.match(/\bassign(?:\s+it)?(?:\s+to\s+[a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})?\s+(.+?)(?=\s+(?:by|due|on|before|with|and|send|notify|share|via)\b|$)/i);
  if (assign?.[1]) return assign[1].trim();

  // 4) Fallback: remove known segments and use what's left.
  let cleaned = rawText;

  cleaned = cleaned.replace(/^\s*(please\s+)?(add|create|new)\s+(a\s+)?task\b\s*[:\-–,]?\s*/i, "");

  if (assigneeName) {
    const nameRe = new RegExp(
      `\\b(?:for|assign(?:\\s+it)?\\s+to|assigned\\s+to)\\s+${escapeRegExp(assigneeName)}\\b`,
      "i",
    );
    cleaned = cleaned.replace(nameRe, " ");

    const first = assigneeName.split(/\s+/)[0];
    if (first && first.toLowerCase() !== assigneeName.toLowerCase()) {
      const firstRe = new RegExp(
        `\\b(?:for|assign(?:\\s+it)?\\s+to|assigned\\s+to)\\s+${escapeRegExp(first)}\\b`,
        "i",
      );
      cleaned = cleaned.replace(firstRe, " ");
    }
  }

  if (deadlineSourceText) {
    const dlRe = new RegExp(escapeRegExp(deadlineSourceText), "i");
    cleaned = cleaned.replace(dlRe, " ");
  }

  // Remove priority phrases.
  cleaned = cleaned.replace(/\b(with\s+)?(critical|urgent|high|medium|low)\s*[- ]?priority\b/gi, " ");

  // Remove WhatsApp phrases.
  cleaned = cleaned.replace(/\b(send|notify|share)\b[^.]*?\b(?:whats\s*app|whatsapp)\b/gi, " ");

  // Remove connecting words that often remain.
  cleaned = cleaned.replace(/\b(?:and|then|please|it)\b/gi, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/^\s*to\s+/i, "");

  return cleaned.trim() || undefined;
}

export function parseTaskCommand(text: string, ctx: ParseVoiceCommandContext = {}): ParsedTaskCommand | null {
  const rawText = text.trim();
  if (!rawText) return null;

  const now = ctx.now ?? new Date();
  const lower = rawText.toLowerCase();

  const deadlineResult = findDeadlineInText(rawText, now);
  const deadline = deadlineResult?.dateKey;

  const sendWhatsApp = parseSendWhatsApp(lower);
  const priority = parsePriority(lower);

  const assigneeFromPattern = findAssigneeByPatterns(rawText);
  const assigneeName = assigneeFromPattern
    ? assigneeFromPattern
    : (ctx.knownUsers ? findAssigneeFromKnownUsers(lower, ctx.knownUsers) : undefined);

  const titleCandidate = extractTitleCandidate(rawText, assigneeName, deadlineResult?.sourceText);
  const title = titleCandidate ? capitalizeFirst(titleCandidate) : undefined;

  return {
    rawText,
    title,
    assigneeName,
    deadline,
    priority,
    sendWhatsApp,
  };
}

export function parseVoiceCommand(text: string, ctx: ParseVoiceCommandContext = {}): ParsedVoiceCommand {
  const rawText = text.trim();
  if (!rawText) return { kind: "unknown", rawText };

  const lower = rawText.toLowerCase();

  // Create/assign task intent.
  const hasTaskKeyword = /\btask\b/.test(lower);
  const hasCreateVerb = /\b(add|create|new)\b/.test(lower);
  const hasAssignVerb = /\bassign\b/.test(lower);

  const likelyCreateTask = (hasTaskKeyword && (hasCreateVerb || hasAssignVerb)) || (hasAssignVerb && /\bto\b/.test(lower));

  if (likelyCreateTask) {
    const task = parseTaskCommand(rawText, ctx);

    // If it's literally "new task" / "create task" with no details, open the form.
    const looksBare = /^\s*(new|create|add)\s+(a\s+)?task\s*$/i.test(rawText);
    if (looksBare) return { kind: "open_task_form", rawText };

    if (task) return { kind: "create_task", rawText, command: task };
  }

  // Open task form (dashboard shortcut)
  if (/\b(new task|create task|add task|create a task)\b/.test(lower)) {
    return { kind: "open_task_form", rawText };
  }

  // Clear filters.
  if (lower.includes("show all") || lower.includes("clear") || lower.includes("reset") || lower.includes("all filters")) {
    return { kind: "clear_filters", rawText };
  }

  // Priority filters.
  if (lower.includes("critical")) {
    return { kind: "set_priority_filter", rawText, priority: "critical" };
  }
  if (lower.includes("high")) {
    return { kind: "set_priority_filter", rawText, priority: "high" };
  }
  if (lower.includes("medium")) {
    return { kind: "set_priority_filter", rawText, priority: "medium" };
  }
  if (lower.includes("low")) {
    return { kind: "set_priority_filter", rawText, priority: "low" };
  }

  // Status filters.
  if (lower.includes("in progress") || lower.includes("in-progress") || lower.includes("active")) {
    return { kind: "set_status_filter", rawText, status: "in_progress" };
  }
  if (lower.includes("blocked")) {
    return { kind: "set_status_filter", rawText, status: "blocked" };
  }
  if (lower.includes("done") || lower.includes("complete") || lower.includes("finished")) {
    return { kind: "set_status_filter", rawText, status: "done" };
  }
  if (lower.includes("open")) {
    return { kind: "set_status_filter", rawText, status: "open" };
  }
  if (lower.includes("cancel")) {
    return { kind: "set_status_filter", rawText, status: "cancelled" };
  }

  return { kind: "unknown", rawText };
}
