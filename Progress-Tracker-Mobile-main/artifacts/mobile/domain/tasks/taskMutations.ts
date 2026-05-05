import type { Task } from "@/context/AppContext";
import { normalizeDateKey, todayDateKey, type DateKey } from "@/utils/date";

export class TaskMutationError extends Error {
  override name = "TaskMutationError";
}

export function updateTaskInList(
  tasks: readonly Task[],
  taskId: string,
  updates: Partial<Task>,
  nowIso: string,
): Task[] {
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return tasks as Task[];

  const current = tasks[idx];
  let changed = false;
  const nextTask: Task = { ...current };

  for (const [k, v] of Object.entries(updates) as [keyof Task, Task[keyof Task]][]) {
    if (typeof v === "undefined") continue;
    if (nextTask[k] !== v) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (nextTask as any)[k] = v;
      changed = true;
    }
  }

  if (!changed) return tasks as Task[];

  nextTask.updatedAt = nowIso;
  const next = tasks.slice() as Task[];
  next[idx] = nextTask;
  return next;
}

export function moveTaskDueDate(
  tasks: readonly Task[],
  taskId: string,
  targetDateKey: string,
  nowIso: string,
  options?: {
    allowPastDates?: boolean;
    todayKey?: DateKey;
  },
): Task[] {
  const normalized = normalizeDateKey(targetDateKey);
  if (!normalized) {
    throw new TaskMutationError("Invalid date. Expected YYYY-MM-DD");
  }

  const allowPastDates = options?.allowPastDates ?? true;
  const todayKey = options?.todayKey ?? todayDateKey();
  if (!allowPastDates && normalized < todayKey) {
    throw new TaskMutationError("Past dates are not allowed");
  }

  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return tasks as Task[];

  const current = tasks[idx];
  const currentKey = normalizeDateKey(current.dueDate) ?? current.dueDate.slice(0, 10);
  if (currentKey === normalized) return tasks as Task[];

  const nextTask: Task = {
    ...current,
    dueDate: normalized,
    updatedAt: nowIso,
  };

  const next = tasks.slice() as Task[];
  next[idx] = nextTask;
  return next;
}

/**
 * Same as `moveTaskDueDate` but assumes `normalizedDateKey` is already validated.
 * This variant never throws and is safe to use inside React state updaters.
 */
export function moveTaskDueDateNormalized(
  tasks: readonly Task[],
  taskId: string,
  normalizedDateKey: DateKey,
  nowIso: string,
): Task[] {
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return tasks as Task[];

  const current = tasks[idx];
  const currentKey = normalizeDateKey(current.dueDate) ?? current.dueDate.slice(0, 10);
  if (currentKey === normalizedDateKey) return tasks as Task[];

  const nextTask: Task = {
    ...current,
    dueDate: normalizedDateKey,
    updatedAt: nowIso,
  };

  const next = tasks.slice() as Task[];
  next[idx] = nextTask;
  return next;
}
