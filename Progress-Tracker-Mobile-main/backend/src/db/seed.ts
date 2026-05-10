import "dotenv/config";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../services/supabase/supabaseClient.js";

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: string;
  avatarColor: string;
  phoneNumber?: string;
}

const SEED_USERS: SeedUser[] = [
  { name: "Alex Rivera", email: "admin@taskcommand.io", password: "Admin@123", role: "head_manager", avatarColor: "#1a6cf5" },
  { name: "Jordan Chen", email: "jordan@taskcommand.io", password: "Jordan@123", role: "project_lead", avatarColor: "#16a34a" },
  { name: "Sam Patel", email: "sam@taskcommand.io", password: "Sam@1234", role: "developer", avatarColor: "#9333ea" },
  { name: "Taylor Kim", email: "taylor@taskcommand.io", password: "Taylor@123", role: "support_agent", avatarColor: "#ea580c" },
  { name: "Morgan Lee", email: "morgan@taskcommand.io", password: "Morgan@123", role: "admin_lite", avatarColor: "#0891b2" },
];

const SEED_TASKS = [
  {
    title: "Critical security patch deployment",
    description: "Deploy security patches to production servers. Coordinate with DevOps for zero-downtime rollout.",
    assigneeEmail: "sam@taskcommand.io",
    deadline: "2026-05-15",
    priority: "critical",
    status: "in_progress",
    tags: ["security", "production"],
    notes: "Coordinate with DevOps team",
  },
  {
    title: "Q2 Product roadmap finalization",
    description: "Finalize product roadmap for Q2, including feature prioritization and resource allocation.",
    assigneeEmail: "jordan@taskcommand.io",
    deadline: "2026-05-20",
    priority: "high",
    status: "open",
    tags: ["planning", "roadmap"],
    notes: "",
  },
];

async function getProfileByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seed() {
  console.log("Seeding Supabase...");

  for (const user of SEED_USERS) {
    const existing = await getProfileByEmail(user.email);
    if (existing) {
      console.log(`  skip user ${user.email}`);
      continue;
    }

    const created = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name },
    });
    if (created.error || !created.data.user?.id) throw created.error;

    const { error } = await supabaseAdmin.from("users").insert({
      id: created.data.user.id,
      name: user.name,
      email: user.email,
      password_hash: null,
      phone_number: user.phoneNumber ?? null,
      role: user.role,
      avatar_color: user.avatarColor,
    });
    if (error) throw error;
    console.log(`  created user ${user.email}`);
  }

  const admin = await getProfileByEmail("admin@taskcommand.io");
  if (!admin) throw new Error("Admin seed user was not created");

  for (const task of SEED_TASKS) {
    const assignee = await getProfileByEmail(task.assigneeEmail);
    if (!assignee) continue;

    const { data: existing } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("title", task.title)
      .maybeSingle();
    if (existing) {
      console.log(`  skip task ${task.title}`);
      continue;
    }

    const taskId = `task_${randomUUID().slice(0, 12)}`;
    const { error: taskError } = await supabaseAdmin.from("tasks").insert({
      id: taskId,
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      priority: task.priority,
      status: task.status,
      tags: task.tags,
      notes: task.notes,
      created_by: admin.id,
    });
    if (taskError) throw taskError;

    const { error: assignmentError } = await supabaseAdmin
      .from("task_assignments")
      .insert({ task_id: taskId, user_id: assignee.id });
    if (assignmentError) throw assignmentError;
    console.log(`  created task ${task.title}`);
  }

  console.log("Seed complete.");
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
