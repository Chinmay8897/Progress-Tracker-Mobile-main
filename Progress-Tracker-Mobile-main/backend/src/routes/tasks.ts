import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth, requireHeadManager } from "../middleware/auth.js";
import { supabaseAdmin } from "../services/supabase/supabaseClient.js";
import {
  getTaskById,
  getUserById,
  insertAuditLog,
  listTasksForUser,
  sanitizeTask,
  type TaskPriority,
  type TaskStatus,
} from "../services/supabase/repositories.js";
import {
  sendWAForwardRequest,
  type WAForwardTaskDetails,
} from "../services/notificationService.js";

const router = Router();

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500).trim(),
  description: z.string().max(5000).trim().default(""),
  assigneeId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD"),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "in_progress", "blocked", "done", "cancelled"]).default("open"),
  tags: z.array(z.string().max(50)).max(20).default([]),
  notes: z.string().max(5000).trim().default(""),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  status: z.enum(["open", "in_progress", "blocked", "done", "cancelled"]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(5000).trim().optional(),
});

const movePendingSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function canAccessTask(task: { created_by: string; task_assignments?: Array<{ user_id: string }> }, user: Express.Request["user"]): boolean {
  if (!user) return false;
  if (user.role === "head_manager") return true;
  return task.created_by === user.userId || !!task.task_assignments?.some(a => a.user_id === user.userId);
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function insertNotification(input: {
  type: string;
  message: string;
  targetUser: string;
  performedBy: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    type: input.type,
    message: input.message,
    target_user: input.targetUser,
    created_by: input.performedBy,
    metadata: input.metadata ?? {},
  });
  if (error) console.warn("[Notifications] Failed to write notification:", error.message);
}

router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await listTasksForUser(req.user!);
    res.json(rows.map(sanitizeTask));
  } catch (err) {
    console.error("List tasks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await getTaskById(routeParam(req.params.id));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (!canAccessTask(task, req.user)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    res.json(sanitizeTask(task));
  } catch (err) {
    console.error("Get task error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const data = parsed.data;
    const assigneeId = req.user!.role === "head_manager" ? data.assigneeId : req.user!.userId;
    const assignee = await getUserById(assigneeId);
    if (!assignee) {
      res.status(400).json({ error: "Assignee not found" });
      return;
    }

    const id = `task_${randomUUID().slice(0, 12)}`;
    const { error: taskError } = await supabaseAdmin.from("tasks").insert({
      id,
      title: data.title,
      description: data.description,
      priority: data.priority as TaskPriority,
      status: data.status as TaskStatus,
      deadline: data.dueDate,
      created_by: req.user!.userId,
      tags: data.tags,
      notes: data.notes,
    });
    if (taskError) throw taskError;

    const { error: assignmentError } = await supabaseAdmin.from("task_assignments").insert({
      task_id: id,
      user_id: assigneeId,
    });
    if (assignmentError) {
      await supabaseAdmin.from("tasks").delete().eq("id", id);
      throw assignmentError;
    }

    await insertNotification({
      type: "task_assigned",
      message: `Task assigned: ${data.title}`,
      targetUser: assigneeId,
      performedBy: req.user!.userId,
      metadata: { taskId: id, priority: data.priority, dueDate: data.dueDate },
    });
    await insertAuditLog("tasks.create", req.user!.userId, { taskId: id, assigneeId });

    const created = await getTaskById(id);

    const adminToken = process.env.ADMIN_EXPO_PUSH_TOKEN;
    if (adminToken && assignee.phone_number) {
      const taskDetails: WAForwardTaskDetails = {
        taskId: id,
        taskTitle: data.title,
        priority: data.priority,
        dueDate: data.dueDate,
        assigneeName: assignee.name,
        assigneePhone: assignee.phone_number,
        notes: data.notes || undefined,
      };
      sendWAForwardRequest(adminToken, taskDetails).catch(err => {
        console.error("[tasks] Non-fatal WhatsApp push failure:", err);
      });
    }

    res.status(201).json(sanitizeTask(created!));
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const task = await getTaskById(routeParam(req.params.id));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (!canAccessTask(task, req.user)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    const data = parsed.data;
    const updatePayload = {
      title: data.title ?? task.title,
      description: data.description ?? task.description,
      priority: (data.priority ?? task.priority) as TaskPriority,
      status: (data.status ?? task.status) as TaskStatus,
      deadline: data.dueDate ?? task.deadline,
      tags: data.tags ?? task.tags,
      notes: data.notes ?? task.notes,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("tasks")
      .update(updatePayload)
      .eq("id", task.id);
    if (error) throw error;

    if (data.assigneeId && data.assigneeId !== task.task_assignments?.[0]?.user_id) {
      if (req.user!.role !== "head_manager" && data.assigneeId !== req.user!.userId) {
        res.status(403).json({ error: "Only Head Managers can assign tasks to other users" });
        return;
      }
      const assignee = await getUserById(data.assigneeId);
      if (!assignee) {
        res.status(400).json({ error: "Assignee not found" });
        return;
      }

      await supabaseAdmin.from("task_assignments").delete().eq("task_id", task.id);
      const { error: assignmentError } = await supabaseAdmin
        .from("task_assignments")
        .insert({ task_id: task.id, user_id: data.assigneeId });
      if (assignmentError) throw assignmentError;
    }

    await insertAuditLog("tasks.update", req.user!.userId, { taskId: task.id });
    const updated = await getTaskById(task.id);
    res.json(sanitizeTask(updated!));
  } catch (err) {
    console.error("Update task error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireHeadManager, async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await getTaskById(routeParam(req.params.id));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const { error } = await supabaseAdmin.from("tasks").delete().eq("id", task.id);
    if (error) throw error;

    await insertAuditLog("tasks.delete", req.user!.userId, { taskId: task.id });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete task error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/move-pending", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = movePendingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { dateKey } = parsed.data;
    const allTasks = await listTasksForUser(req.user!);
    const pending = allTasks.filter(t =>
      t.deadline === dateKey &&
      t.status !== "done" &&
      t.status !== "cancelled"
    );

    if (pending.length === 0) {
      res.json({ moved: 0 });
      return;
    }

    const [year, month, day] = dateKey.split("-").map(Number);
    const nextDate = new Date(year, month - 1, day + 1);
    const nextKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;

    const { error } = await supabaseAdmin
      .from("tasks")
      .update({ deadline: nextKey, updated_at: new Date().toISOString() })
      .in("id", pending.map(task => task.id));
    if (error) throw error;

    await insertAuditLog("tasks.move_pending", req.user!.userId, { dateKey, nextKey, moved: pending.length });
    res.json({ moved: pending.length, newDate: nextKey });
  } catch (err) {
    console.error("Move pending error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
