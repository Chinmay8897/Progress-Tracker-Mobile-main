import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../services/supabase/supabaseClient.js";
import { getUserById } from "../services/supabase/repositories.js";

const AVATAR_COLORS = [
  "#1a6cf5", "#16a34a", "#9333ea", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#4f46e5", "#059669",
];

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  supabaseAccessToken: string;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

async function ensureUserProfile(input: { id: string; email: string; name?: string | null }) {
  const existing = await getUserById(input.id);
  if (existing) return existing;

  const fallbackName = input.name?.trim() || input.email.split("@")[0] || "User";
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      id: input.id,
      name: fallbackName,
      email: input.email,
      password_hash: null,
      phone_number: null,
      role: "developer",
      avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.id || !data.user.email) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  let profile;
  try {
    profile = await ensureUserProfile({
      id: data.user.id,
      email: data.user.email,
      name: typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : null,
    });
  } catch (err) {
    console.error("Auth profile upsert failed:", err);
    res.status(500).json({ error: "Could not initialize user profile" });
    return;
  }

  if (!profile) {
    res.status(401).json({ error: "User profile is missing" });
    return;
  }

  const exp = typeof data.user.app_metadata?.exp === "number" ? data.user.app_metadata.exp : undefined;
  req.user = {
    userId: data.user.id,
    email: data.user.email,
    role: profile.role,
    supabaseAccessToken: token,
    exp,
  };

  next();
}

export function requireHeadManager(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (req.user.role !== "head_manager") {
    res.status(403).json({ error: "Insufficient permissions. Head Manager role required." });
    return;
  }

  next();
}
