import { Priority, Task, User } from "@/context/AppContext";
import { DateKey, parseDateKey, todayDateKey, addDaysToDateKey } from "@/utils/date";
import { shareToWhatsApp, WhatsAppShareResult } from "@/utils/whatsapp";
import { ParsedTaskCommand } from "@/domain/voice/CommandParser";

export type MissingTaskField = "title" | "assignee" | "deadline";

export interface TaskVoicePrefill {
  title?: string;
  description?: string;
  assigneeId?: string;
  dueDate?: DateKey;
  priority?: Priority;
}

export type CreateTaskFromVoiceResult =
  | {
      kind: "created";
      message: string;
      whatsapp?: WhatsAppShareResult;
    }
  | {
      kind: "needs_info";
      message: string;
      missing: MissingTaskField[];
      prefill: TaskVoicePrefill;
    }
  | {
      kind: "error";
      message: string;
    };

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveUserByName(users: User[], assigneeName: string): User | null {
  const needle = normalizeName(assigneeName);
  if (!needle) return null;

  // Exact full-name match.
  const exact = users.find(u => normalizeName(u.name) === needle);
  if (exact) return exact;

  // Match by first name.
  const first = needle.split(" ")[0];
  const byFirst = users.find(u => normalizeName(u.name).split(" ")[0] === first);
  if (byFirst) return byFirst;

  // Fuzzy includes.
  const includes = users.find(u => normalizeName(u.name).includes(first));
  return includes ?? null;
}

function formatDueLabel(dateKey: string): string {
  const d = parseDateKey(dateKey) ?? new Date(dateKey);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
}

function priorityLabel(p: Priority): string {
  return {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  }[p];
}

function defaultDueDate(nowKey: DateKey): DateKey {
  return addDaysToDateKey(nowKey, 7) ?? nowKey;
}

function isPastDateKey(dateKey: DateKey, todayKey: DateKey): boolean {
  // Both in YYYY-MM-DD format; lexicographic compare works.
  return dateKey < todayKey;
}

/**
 * Creates a task from a parsed voice command.
 *
 * Required fields:
 * - title
 * - assignee
 * - deadline
 */
export async function createTaskFromVoiceCommand(params: {
  command: ParsedTaskCommand;
  users: User[];
  currentUser: User;
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  now?: Date;
}): Promise<CreateTaskFromVoiceResult> {
  const { command, users, currentUser, addTask } = params;

  const nowKey = todayDateKey();
  const dueDate = command.deadline ?? defaultDueDate(nowKey);
  const priority: Priority = command.priority ?? "medium";

  const missing: MissingTaskField[] = [];

  const title = command.title?.trim();
  if (!title) missing.push("title");

  const assigneeName = command.assigneeName?.trim();
  const assignee = assigneeName ? resolveUserByName(users, assigneeName) : null;
  if (!assignee) missing.push("assignee");

  if (!command.deadline) missing.push("deadline");

  // If a deadline was parsed but is in the past, treat it as missing (prompt user).
  if (command.deadline && isPastDateKey(command.deadline, nowKey)) {
    if (!missing.includes("deadline")) missing.push("deadline");
  }

  const prefill: TaskVoicePrefill = {
    title: title || undefined,
    description: "",
    assigneeId: assignee?.id,
    dueDate,
    priority,
  };

  if (missing.length > 0) {
    const missingLabel = missing.join(", ");
    return {
      kind: "needs_info",
      missing,
      prefill,
      message: `Missing ${missingLabel}. Please complete the task details.`,
    };
  }

  // At this point, title + assignee are non-null.
  await addTask({
    title: title!,
    description: "",
    assigneeId: assignee!.id,
    dueDate,
    priority,
    status: "open",
    tags: [],
    notes: "",
    createdBy: currentUser.id,
  });

  let whatsapp: WhatsAppShareResult | undefined;
  if (command.sendWhatsApp) {
    const lines = [
      `Task: ${title!}`,
      `Assignee: ${assignee!.name}`,
      `Priority: ${priorityLabel(priority)}`,
      `Due: ${formatDueLabel(dueDate)}`,
    ];
    whatsapp = await shareToWhatsApp(lines.join("\n"));
  }

  const message = command.sendWhatsApp
    ? `Created task for ${assignee!.name} and shared on WhatsApp.`
    : `Created task for ${assignee!.name}.`;

  return { kind: "created", message, whatsapp };
}
