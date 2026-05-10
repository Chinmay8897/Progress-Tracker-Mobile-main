/**
 * Voice command system — shared type definitions.
 *
 * Defines all types used across the pipeline:
 * Voice Capture → Command Parsing → Execution → UI Feedback
 */

import type { Priority, TaskStatus } from "@/context/AppContext";
import type { DateKey } from "@/utils/date";

// ─── Voice Capture ──────────────────────────────────────────────────────────

export type VoiceStatus =
  | "idle"
  | "listening"
  | "processing"
  | "done"
  | "error"
  | "unsupported";

export interface VoiceCaptureCallbacks {
  onStatus: (status: VoiceStatus) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onResult: (finalTranscript: string) => void;
  onEnd?: () => void;
}

export interface VoiceCaptureOptions {
  /** Auto-stop after this duration (ms). Default: 15000 */
  maxListenMs?: number;
  /** BCP-47 language tag. Default: "en-US" */
  language?: string;
}

// ─── Command Parsing ────────────────────────────────────────────────────────

export type CommandIntent =
  | "create_task"
  | "update_task"
  | "move_task"
  | "send_whatsapp"
  | "open_form"
  | "set_filter"
  | "clear_filters"
  | "unknown";

export interface ParsedCommand {
  intent: CommandIntent;
  rawText: string;
  entities: ParsedEntities;
}

export interface ParsedEntities {
  taskTitle?: string;
  assigneeName?: string;
  deadline?: DateKey;
  priority?: Priority;
  status?: TaskStatus;
  sendWhatsApp: boolean;
  /** For set_filter intent only. */
  filterType?: "priority" | "status";
  filterValue?: string;
}

/** Context supplied to the parser for smarter entity resolution. */
export interface ParserContext {
  now?: Date;
  knownUsers?: Array<{ name: string }>;
}

// ─── Execution ──────────────────────────────────────────────────────────────

export type MissingField = "title" | "assignee" | "deadline";

export interface TaskPrefill {
  title?: string;
  description?: string;
  assigneeId?: string;
  dueDate?: DateKey;
  priority?: Priority;
}

export type ExecutionResult =
  | { kind: "created"; message: string }
  | { kind: "updated"; message: string }
  | { kind: "moved"; message: string }
  | { kind: "whatsapp_sent"; message: string }
  | { kind: "form_opened"; message: string; prefill: TaskPrefill }
  | { kind: "filter_applied"; message: string; filterType: "priority" | "status"; filterValue: string }
  | { kind: "filters_cleared"; message: string }
  | { kind: "needs_info"; message: string; missing: MissingField[]; prefill: TaskPrefill }
  | { kind: "error"; message: string };

/** Whether a command intent requires explicit user confirmation. */
export function requiresConfirmation(intent: CommandIntent): boolean {
  return (
    intent === "create_task" ||
    intent === "update_task" ||
    intent === "move_task" ||
    intent === "send_whatsapp"
  );
}

/** Returns a human-readable summary of a parsed command for the confirmation UI. */
export function summarizeCommand(cmd: ParsedCommand): string {
  const { intent, entities } = cmd;
  const parts: string[] = [];

  switch (intent) {
    case "create_task":
      parts.push("Create task");
      if (entities.taskTitle) parts.push(`"${entities.taskTitle}"`);
      if (entities.assigneeName) parts.push(`for ${entities.assigneeName}`);
      if (entities.deadline) parts.push(`due ${entities.deadline}`);
      if (entities.priority) parts.push(`(${entities.priority} priority)`);
      if (entities.sendWhatsApp) parts.push("+ send on WhatsApp");
      break;
    case "update_task":
      parts.push("Update task");
      if (entities.taskTitle) parts.push(`"${entities.taskTitle}"`);
      if (entities.status) parts.push(`→ ${entities.status.replace(/_/g, " ")}`);
      break;
    case "move_task":
      parts.push("Move task");
      if (entities.taskTitle) parts.push(`"${entities.taskTitle}"`);
      if (entities.deadline) parts.push(`to ${entities.deadline}`);
      break;
    case "send_whatsapp":
      parts.push("Send tasks on WhatsApp");
      if (entities.assigneeName) parts.push(`to ${entities.assigneeName}`);
      break;
    default:
      parts.push(cmd.rawText);
  }

  return parts.join(" ");
}
