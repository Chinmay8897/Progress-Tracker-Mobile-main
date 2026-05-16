import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authLimiter, registerLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin, supabaseAuthClient } from "../services/supabase/supabaseClient.js";
import {
  getUserByEmail,
  getUserById,
  insertAuditLog,
  sanitizeUser,
  type UserRole,
} from "../services/supabase/repositories.js";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber.js";

const router = Router();

const AVATAR_COLORS = [
  "#1a6cf5", "#16a34a", "#9333ea", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#4f46e5", "#059669",
];

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const loginSchema = z.object({
  email: z.string().email("Invalid email format").max(255).trim(),
  password: z.string().min(1, "Password is required").max(128),
});

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

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).trim(),
  email: z.string().email("Invalid email format").max(255).trim(),
  password: strongPassword,
  phoneNumber: phoneSchema,
  role: z.enum(["admin", "manager"]).default("manager"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: strongPassword,
});

async function createProfile(input: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phoneNumber?: string;
  avatarColor?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      id: input.id,
      name: input.name,
      email: input.email,
      password_hash: null,
      phone_number: input.phoneNumber ?? null,
      role: input.role,
      avatar_color: input.avatarColor ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

router.post("/register", registerLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { name, email, password, phoneNumber, role } = parsed.data;
    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "Registration failed. An account with this email may already exist." });
      return;
    }

    const createdAuth = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createdAuth.error || !createdAuth.data.user?.id) {
      res.status(400).json({ error: createdAuth.error?.message ?? "Registration failed" });
      return;
    }

    let profile;
    try {
      profile = await createProfile({
        id: createdAuth.data.user.id,
        name,
        email,
        phoneNumber: phoneNumber ?? undefined,
        role,
      });
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuth.data.user.id);
      throw err;
    }

    const signedIn = await supabaseAuthClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuth.data.user.id);
      res.status(502).json({ error: signedIn.error?.message ?? "Registration completed but session could not be established" });
      return;
    }

    await insertAuditLog("auth.register", createdAuth.data.user.id, { email });
    res.status(201).json({
      token: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
      user: sanitizeUser(profile, true),
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password } = parsed.data;
    const signedIn = await supabaseAuthClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session || !signedIn.data.user?.id) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const profile = await getUserById(signedIn.data.user.id);
    if (!profile) {
      res.status(401).json({ error: "User profile is missing" });
      return;
    }

    await insertAuditLog("auth.login", profile.id, { email: profile.email });
    res.json({
      token: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
      user: sanitizeUser(profile, true),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    const refreshed = await supabaseAuthClient.auth.refreshSession({
      refresh_token: parsed.data.refreshToken,
    });
    if (refreshed.error || !refreshed.data.session || !refreshed.data.user?.id) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const profile = await getUserById(refreshed.data.user.id);
    if (!profile) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }

    res.json({
      token: refreshed.data.session.access_token,
      refreshToken: refreshed.data.session.refresh_token,
      user: sanitizeUser(profile, true),
    });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await supabaseAdmin.auth.admin.signOut(req.user!.supabaseAccessToken, "global");
    await insertAuditLog("auth.logout", req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/change-password", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const profile = await getUserById(req.user!.userId);
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const check = await supabaseAuthClient.auth.signInWithPassword({
      email: profile.email,
      password: parsed.data.currentPassword,
    });
    if (check.error) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const updated = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: parsed.data.newPassword,
    });
    if (updated.error) {
      res.status(400).json({ error: updated.error.message });
      return;
    }

    const signedIn = await supabaseAuthClient.auth.signInWithPassword({
      email: profile.email,
      password: parsed.data.newPassword,
    });
    if (signedIn.error || !signedIn.data.session) {
      res.status(200).json({ message: "Password changed successfully" });
      return;
    }

    await insertAuditLog("auth.change_password", profile.id);
    res.json({
      token: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = await getUserById(req.user!.userId);
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(sanitizeUser(profile, true));
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
