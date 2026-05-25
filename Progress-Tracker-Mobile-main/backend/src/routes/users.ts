import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { supabaseAdmin } from "../services/supabase/supabaseClient.js";
import {
  getUserByEmail,
  getUserById,
  insertAuditLog,
  listUsers,
  normalizeAppRole,
  sanitizeUser,
  type UserRole,
} from "../services/supabase/repositories.js";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber.js";

const router = Router();

const AVATAR_COLORS = [
  "#1a6cf5", "#16a34a", "#9333ea", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#4f46e5", "#059669",
];

const phoneSchema = z.string().max(32).optional().nullable().transform((val, ctx) => {
  if (val === undefined) return undefined;
  if (val === null || val.trim() === "") return null;
  const normalized = normalizePhoneNumber(val);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid 10-digit Indian mobile number",
    });
    return z.NEVER;
  }
  return normalized;
});

const createUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).trim(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(["admin", "manager"]),
  avatarColor: z.string().optional(),
  phoneNumber: phoneSchema,
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  email: z.string().email().max(255).trim().optional(),
  role: z.enum(["admin", "manager"]).optional(),
  avatarColor: z.string().optional(),
  phoneNumber: phoneSchema,
});

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const includePhone = req.user!.role === "admin";
    const rows = await listUsers();
    res.json(rows.map(user => sanitizeUser(user, includePhone || user.id === req.user!.userId)));
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserById(routeParam(req.params.id));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const includePhone = req.user!.role === "admin" || req.user!.userId === user.id;
    res.json(sanitizeUser(user, includePhone));
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { name, email, password, role, avatarColor, phoneNumber } = parsed.data;
    if (await getUserByEmail(email)) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    const createdAuth = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createdAuth.error || !createdAuth.data.user?.id) {
      res.status(400).json({ error: createdAuth.error?.message ?? "Could not create user" });
      return;
    }

    const color = avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const { data, error } = await supabaseAdmin
      .from("users")
      .insert({
        id: createdAuth.data.user.id,
        name,
        email,
        password_hash: null,
        phone_number: phoneNumber ?? null,
        role: role as UserRole,
        avatar_color: color,
      })
      .select("*")
      .single();

    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuth.data.user.id);
      throw error;
    }

    await insertAuditLog("users.create", req.user!.userId, { userId: createdAuth.data.user.id, role });
    res.status(201).json(sanitizeUser(data, true));
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const existing = await getUserById(routeParam(req.params.id));
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (parsed.data.email && parsed.data.email.toLowerCase() !== existing.email.toLowerCase()) {
      const duplicate = await getUserByEmail(parsed.data.email);
      if (duplicate) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }
      const authUpdate = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        email: parsed.data.email,
        email_confirm: true,
      });
      if (authUpdate.error) {
        res.status(400).json({ error: authUpdate.error.message });
        return;
      }
    }

    const updatePayload = {
      name: parsed.data.name ?? existing.name,
      email: parsed.data.email ?? existing.email,
      role: (parsed.data.role ?? existing.role) as UserRole,
      avatar_color: parsed.data.avatarColor ?? existing.avatar_color,
      phone_number: parsed.data.phoneNumber === undefined ? existing.phone_number : parsed.data.phoneNumber,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

    await insertAuditLog("users.update", req.user!.userId, { userId: existing.id });
    res.json(sanitizeUser(data, true));
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = routeParam(req.params.id);
    if (userId === req.user!.userId) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // If deleting another admin, ensure at least one admin remains
    if (normalizeAppRole(user.role) === "admin") {
      const allUsers = await listUsers();
      const adminCount = allUsers.filter(u => normalizeAppRole(u.role) === "admin").length;
      if (adminCount <= 1) {
        res.status(400).json({ error: "Cannot delete the last admin. Promote another user first." });
        return;
      }
    }

    // Check if the user has created any tasks (prevent ON DELETE RESTRICT error)
    const { count, error: countError } = await supabaseAdmin
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("created_by", user.id);

    if (countError) throw countError;
    if (count && count > 0) {
      res.status(400).json({ error: "Cannot delete user because they have created tasks. Please delete or reassign their tasks first." });
      return;
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    await insertAuditLog("users.delete", req.user!.userId, { userId: user.id, deletedRole: user.role });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Role Change (dedicated endpoint) ───────────────────────────────────────

const changeRoleSchema = z.object({
  role: z.enum(["admin", "manager"]),
});

router.patch("/:id/role", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = changeRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid role. Must be 'admin' or 'manager'.", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const targetId = routeParam(req.params.id);
    const newRole = parsed.data.role as UserRole;

    // Prevent self-demotion
    if (targetId === req.user!.userId && newRole !== "admin") {
      res.status(400).json({ error: "Cannot demote yourself. Ask another admin to change your role." });
      return;
    }

    const target = await getUserById(targetId);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentRole = normalizeAppRole(target.role);
    if (currentRole === newRole) {
      res.json(sanitizeUser(target, true));
      return;
    }

    // If demoting an admin, ensure at least one admin remains
    if (currentRole === "admin" && newRole === "manager") {
      const allUsers = await listUsers();
      const adminCount = allUsers.filter(u => normalizeAppRole(u.role) === "admin").length;
      if (adminCount <= 1) {
        res.status(400).json({ error: "Cannot demote the last admin. Promote another user first." });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", targetId)
      .select("*")
      .single();

    if (error) throw error;

    await insertAuditLog("users.role_change", req.user!.userId, {
      userId: targetId,
      previousRole: currentRole,
      newRole,
    });

    res.json(sanitizeUser(data, true));
  } catch (err) {
    console.error("Change role error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

