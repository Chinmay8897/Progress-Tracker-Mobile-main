import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authLimiter, registerLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin, supabaseAuthClient } from "../services/supabase/supabaseClient.js";
import { getUserById, insertAuditLog, sanitizeUser } from "../services/supabase/repositories.js";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber.js";
import { authService } from "../services/authService.js";
import { googleTokenVerificationService } from "../services/googleTokenVerificationService.js";
import { otpService } from "../services/otpService.js";

const router = Router();

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

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format").max(255).trim(),
});

const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email format").max(255).trim(),
  code: z.string().length(6, "OTP must be 6 digits"),
});

const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email format").max(255).trim(),
  newPassword: strongPassword,
});

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).trim().optional(),
  phoneNumber: phoneSchema,
});

// --- GOOGLE AUTHENTICATION ---

router.post("/google", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== "string") {
      res.status(400).json({ error: "Google ID Token is required" });
      return;
    }

    const sessionData = await googleTokenVerificationService.verifyAndSync(idToken);
    await insertAuditLog("auth.google_login", sessionData.user.id, { email: sessionData.user.email });
    res.json(sessionData);
  } catch (err: any) {
    console.error("Google login error:", err);
    res.status(401).json({ error: err.message || "Authentication failed" });
  }
});

// --- STANDARD AUTHENTICATION ---

router.post("/register", registerLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { name, email, password, phoneNumber, role } = parsed.data;
    const sessionData = await authService.register(name, email, password, phoneNumber, role);
    res.status(201).json(sessionData);
  } catch (err: any) {
    console.error("Register error:", err);
    res.status(err.message.includes("exist") ? 409 : 400).json({ error: err.message || "Registration failed" });
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
    const sessionData = await authService.login(email, password);
    res.json(sessionData);
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(401).json({ error: err.message || "Invalid email or password" });
  }
});

// --- PASSWORD RECOVERY ---

router.post("/forgot-password", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }
    await otpService.generateAndSendOtp(parsed.data.email);
    res.json({ success: true, message: "If that email is registered, an OTP has been sent." });
  } catch (err: any) {
    console.error("Forgot password error:", err);
    res.status(429).json({ error: err.message || "Too many requests" });
  }
});

router.post("/verify-otp", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request payload" });
      return;
    }
    otpService.verifyOtp(parsed.data.email, parsed.data.code);
    res.json({ success: true, message: "OTP verified successfully." });
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Invalid OTP" });
  }
});

router.post("/reset-password", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { email, newPassword } = parsed.data;
    if (!otpService.isVerified(email)) {
      res.status(403).json({ error: "Unauthorized. You must verify your OTP first." });
      return;
    }
    await authService.resetPassword(email, newPassword);
    otpService.clearOtp(email);
    res.json({ success: true, message: "Password has been successfully reset." });
  } catch (err: any) {
    console.error("Reset password error:", err);
    res.status(400).json({ error: err.message || "Failed to reset password" });
  }
});

// --- SESSION MANAGEMENT ---

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

router.patch("/me/profile", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
    }
    if (parsed.data.phoneNumber !== undefined) {
      updates.phone_number = parsed.data.phoneNumber;
    }

    if (Object.keys(updates).length === 1) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", req.user!.userId)
      .select("*")
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: "This phone number is already registered to another user." });
        return;
      }
      throw error;
    }

    // Also update name in auth if it was changed
    if (parsed.data.name !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(req.user!.userId, {
        user_metadata: { name: parsed.data.name }
      });
    }

    await insertAuditLog("auth.update_profile", req.user!.userId);
    res.json(sanitizeUser(data, true));
  } catch (err: any) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
