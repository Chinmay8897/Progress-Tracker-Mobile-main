import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireHeadManager } from "../middleware/auth.js";
import { supabaseAdmin } from "../services/supabase/supabaseClient.js";
import {
  getUserByEmail,
  getUserById,
  insertAuditLog,
  listUsers,
  sanitizeUser,
  type AppRole,
} from "../services/supabase/repositories.js";

const router = Router();

const AVATAR_COLORS = [
  "#1a6cf5", "#16a34a", "#9333ea", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#4f46e5", "#059669",
];

const createUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).trim(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(["head_manager", "admin_lite", "project_lead", "developer", "support_agent"]),
  avatarColor: z.string().optional(),
  phoneNumber: z.string().max(32).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  email: z.string().email().max(255).trim().optional(),
  role: z.enum(["head_manager", "admin_lite", "project_lead", "developer", "support_agent"]).optional(),
  avatarColor: z.string().optional(),
  phoneNumber: z.string().max(32).nullable().optional(),
});

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const includePhone = req.user!.role === "head_manager";
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
    const includePhone = req.user!.role === "head_manager" || req.user!.userId === user.id;
    res.json(sanitizeUser(user, includePhone));
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireHeadManager, async (req: Request, res: Response): Promise<void> => {
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
        role: role as AppRole,
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

router.put("/:id", requireAuth, requireHeadManager, async (req: Request, res: Response): Promise<void> => {
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
      role: (parsed.data.role ?? existing.role) as AppRole,
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

router.delete("/:id", requireAuth, requireHeadManager, async (req: Request, res: Response): Promise<void> => {
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

    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    await insertAuditLog("users.delete", req.user!.userId, { userId: user.id });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
