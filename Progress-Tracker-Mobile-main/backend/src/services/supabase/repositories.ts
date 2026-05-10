import { supabaseAdmin } from "./supabaseClient.js";

export type AppRole = "head_manager" | "admin_lite" | "project_lead" | "developer" | "support_agent";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  phone_number: string | null;
  role: AppRole;
  avatar_color: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: string;
  created_by: string;
  tags: string[];
  notes: string;
  created_at: string;
  updated_at: string;
  task_assignments?: Array<{ user_id: string }>;
}

export function sanitizeUser(user: UserRow, includePhone = false) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarColor: user.avatar_color,
    phoneNumber: includePhone ? user.phone_number ?? "" : "",
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export function sanitizeTask(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? "",
    assigneeId: task.task_assignments?.[0]?.user_id ?? "",
    dueDate: task.deadline,
    priority: task.priority,
    status: task.status,
    tags: Array.isArray(task.tags) ? task.tags : [],
    notes: task.notes ?? "",
    createdBy: task.created_by,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as UserRow | null;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw error;
  return data as UserRow | null;
}

export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export async function insertAuditLog(action: string, performedBy: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    action,
    performed_by: performedBy,
    metadata,
  });
  if (error) console.warn("[AuditLog] Failed to write audit log:", error.message);
}

export async function getTaskById(id: string): Promise<TaskRow | null> {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("*, task_assignments(user_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as TaskRow | null;
}

export async function listTasksForUser(user: { userId: string; role: string }): Promise<TaskRow[]> {
  if (user.role === "head_manager") {
    const { data, error } = await supabaseAdmin
      .from("tasks")
      .select("*, task_assignments(user_id)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as TaskRow[];
  }

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("task_assignments")
    .select("task_id")
    .eq("user_id", user.userId);
  if (assignmentError) throw assignmentError;

  const taskIds = (assignments ?? []).map(a => a.task_id);
  if (taskIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("*, task_assignments(user_id)")
    .in("id", taskIds)
    .order("deadline", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}
