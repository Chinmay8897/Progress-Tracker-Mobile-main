/**
 * CommandExecutor — Execute parsed voice commands against app state.
 *
 * Handles:
 * - create_task  → calls addTask, optionally shares on WhatsApp
 * - update_task  → finds task by title, calls updateTask
 * - move_task    → finds task by title, calls moveTaskToDate
 * - send_whatsapp → composes message for a user's tasks, shares
 * - open_form    → returns prefill data for the task form modal
 * - set_filter / clear_filters → returns filter instructions
 */

import type { Priority, Task, User } from "@/context/AppContext";
import type { DateKey } from "@/utils/date";
import { todayDateKey, addDaysToDateKey, parseDateKey } from "@/utils/date";
import { WhatsAppService } from "@/services/whatsappService";
import type { ParsedCommand, ExecutionResult, MissingField, TaskPrefill } from "./types";

// ─── Execution Context ──────────────────────────────────────────────────────

export interface ExecutionContext {
  users: User[];
  tasks: Task[];
  currentUser: User;
  addTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  moveTaskToDate: (taskId: string, dateKey: string) => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveUser(users: User[], name: string): User | null {
  const needle = normalizeName(name);
  if (!needle) return null;

  // Exact full name
  const exact = users.find(u => normalizeName(u.name) === needle);
  if (exact) return exact;

  // First name match
  const first = needle.split(" ")[0];
  const byFirst = users.find(u => normalizeName(u.name).split(" ")[0] === first);
  if (byFirst) return byFirst;

  // Includes
  return users.find(u => normalizeName(u.name).includes(first)) ?? null;
}

function findTaskByTitle(tasks: Task[], titleQuery: string): Task | null {
  if (!titleQuery) return null;
  const needle = normalizeName(titleQuery);

  // Exact match
  const exact = tasks.find(t => normalizeName(t.title) === needle);
  if (exact) return exact;

  // Contains match — prefer shortest title containing the needle
  const matches = tasks
    .filter(t => normalizeName(t.title).includes(needle))
    .sort((a, b) => a.title.length - b.title.length);
  if (matches.length > 0) return matches[0];

  // Reverse contains — needle contains the task title
  const reverse = tasks
    .filter(t => needle.includes(normalizeName(t.title)))
    .sort((a, b) => b.title.length - a.title.length);
  return reverse[0] ?? null;
}

function formatDueLabel(dateKey: string): string {
  const d = parseDateKey(dateKey) ?? new Date(dateKey);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
}

function priorityLabel(p: Priority): string {
  return { critical: "Critical", high: "High", medium: "Medium", low: "Low" }[p];
}

function defaultDueDate(): DateKey {
  return addDaysToDateKey(todayDateKey(), 7) ?? todayDateKey();
}

// ─── Executor ───────────────────────────────────────────────────────────────

export async function executeCommand(
  cmd: ParsedCommand,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const { intent, entities } = cmd;

  switch (intent) {
    case "create_task":
      return executeCreateTask(entities, ctx);
    case "update_task":
      return executeUpdateTask(entities, ctx);
    case "move_task":
      return executeMoveTask(entities, ctx);
    case "send_whatsapp":
      return executeSendWhatsApp(entities, ctx);
    case "open_form":
      return executeOpenForm(entities, ctx);
    case "set_filter":
      return executeSetFilter(entities);
    case "clear_filters":
      return { kind: "filters_cleared", message: "All filters cleared" };
    default:
      return { kind: "error", message: "Could not understand that command. Try rephrasing." };
  }
}

// ─── Create Task ────────────────────────────────────────────────────────────

async function executeCreateTask(
  entities: ParsedCommand["entities"],
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const dueDate = entities.deadline ?? defaultDueDate();
  const priority: Priority = entities.priority ?? "medium";
  const missing: MissingField[] = [];

  const title = entities.taskTitle?.trim();
  if (!title) missing.push("title");

  const assignee = entities.assigneeName ? resolveUser(ctx.users, entities.assigneeName) : null;
  if (!assignee) missing.push("assignee");

  if (!entities.deadline) missing.push("deadline");

  // If deadline is in the past, treat as missing
  if (entities.deadline && entities.deadline < todayDateKey()) {
    if (!missing.includes("deadline")) missing.push("deadline");
  }

  const prefill: TaskPrefill = {
    title: title || undefined,
    description: "",
    assigneeId: assignee?.id,
    dueDate,
    priority,
  };

  if (missing.length > 0) {
    return {
      kind: "needs_info",
      missing,
      prefill,
      message: `Missing ${missing.join(", ")}. Please complete the details.`,
    };
  }

  await ctx.addTask({
    title: title!,
    description: "",
    assigneeId: assignee!.id,
    dueDate,
    priority,
    status: "open",
    tags: [],
    notes: "",
    createdBy: ctx.currentUser.id,
  });

  // WhatsApp sharing (best-effort, don't fail the whole command)
  if (entities.sendWhatsApp) {
    try {
      const msg = [
        `📋 Task: ${title!}`,
        `👤 Assignee: ${assignee!.name}`,
        `⚡ Priority: ${priorityLabel(priority)}`,
        `📅 Due: ${formatDueLabel(dueDate)}`,
      ].join("\n");
      await WhatsAppService.sendMessage(assignee!, msg);
    } catch {
      // WhatsApp sharing failed but task was created
    }
  }

  const message = entities.sendWhatsApp
    ? `Created task for ${assignee!.name} and shared on WhatsApp.`
    : `Created task "${title!}" for ${assignee!.name}.`;

  return { kind: "created", message };
}

// ─── Update Task ────────────────────────────────────────────────────────────

async function executeUpdateTask(
  entities: ParsedCommand["entities"],
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  if (!entities.taskTitle) {
    return { kind: "error", message: "Could not identify which task to update." };
  }

  const task = findTaskByTitle(ctx.tasks, entities.taskTitle);
  if (!task) {
    return { kind: "error", message: `No task found matching "${entities.taskTitle}".` };
  }

  const newStatus = entities.status;
  if (!newStatus) {
    return { kind: "error", message: "Could not determine the new status. Try: \"Mark <task> as done\"." };
  }

  await ctx.updateTask(task.id, { status: newStatus });
  return {
    kind: "updated",
    message: `Updated "${task.title}" → ${newStatus.replace(/_/g, " ")}.`,
  };
}

// ─── Move Task ──────────────────────────────────────────────────────────────

async function executeMoveTask(
  entities: ParsedCommand["entities"],
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  if (!entities.taskTitle) {
    return { kind: "error", message: "Could not identify which task to move." };
  }

  const task = findTaskByTitle(ctx.tasks, entities.taskTitle);
  if (!task) {
    return { kind: "error", message: `No task found matching "${entities.taskTitle}".` };
  }

  if (!entities.deadline) {
    return { kind: "error", message: "Could not determine the target date. Try: \"Move <task> to May 20\"." };
  }

  await ctx.moveTaskToDate(task.id, entities.deadline);
  return {
    kind: "moved",
    message: `Moved "${task.title}" to ${formatDueLabel(entities.deadline)}.`,
  };
}

// ─── Send WhatsApp ──────────────────────────────────────────────────────────

async function executeSendWhatsApp(
  entities: ParsedCommand["entities"],
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const targetUser = entities.assigneeName ? resolveUser(ctx.users, entities.assigneeName) : null;

  if (!targetUser) {
    return { kind: "error", message: "Could not identify the team member. Try: \"Send tasks to Rahul on WhatsApp\"." };
  }

  const userTasks = ctx.tasks.filter(t => t.assigneeId === targetUser.id && t.status !== "done" && t.status !== "cancelled");

  if (userTasks.length === 0) {
    return { kind: "error", message: `${targetUser.name} has no pending tasks to share.` };
  }

  const lines = [
    `📋 Tasks for ${targetUser.name}:`,
    "",
    ...userTasks.map((t, i) =>
      `${i + 1}. ${t.title} (${priorityLabel(t.priority as Priority)}) — Due: ${formatDueLabel(t.dueDate)}`,
    ),
  ];

  try {
    await WhatsAppService.sendMessage(targetUser, lines.join("\n"));
    return { kind: "whatsapp_sent", message: `Shared ${userTasks.length} task(s) for ${targetUser.name} on WhatsApp.` };
  } catch (err: any) {
    return { kind: "error", message: err.message || "Failed to send WhatsApp message." };
  }
}

// ─── Open Form ──────────────────────────────────────────────────────────────

function executeOpenForm(
  entities: ParsedCommand["entities"],
  ctx: ExecutionContext,
): ExecutionResult {
  const assignee = entities.assigneeName ? resolveUser(ctx.users, entities.assigneeName) : null;
  return {
    kind: "form_opened",
    message: "Opened task form",
    prefill: {
      title: entities.taskTitle,
      description: "",
      assigneeId: assignee?.id,
      dueDate: entities.deadline,
      priority: entities.priority,
    },
  };
}

// ─── Set Filter ─────────────────────────────────────────────────────────────

function executeSetFilter(entities: ParsedCommand["entities"]): ExecutionResult {
  if (!entities.filterType || !entities.filterValue) {
    return { kind: "error", message: "Could not determine filter. Try: \"show critical\" or \"show done\"." };
  }
  const label = entities.filterValue.replace(/_/g, " ");
  return {
    kind: "filter_applied",
    message: `Filtered by ${label}`,
    filterType: entities.filterType,
    filterValue: entities.filterValue,
  };
}
