import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../services/supabase/supabaseClient.js";
import { insertAuditLog } from "../services/supabase/repositories.js";

const router = Router();

const voiceLogSchema = z.object({
  rawCommand: z.string().min(1).max(2000),
  parsedIntent: z.string().max(100).nullable().optional(),
  executionStatus: z.enum(["pending", "succeeded", "failed", "cancelled", "needs_info"]),
  metadata: z.record(z.unknown()).optional(),
});



router.post("/voice-logs", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = voiceLogSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("voice_logs")
      .insert({
        raw_command: parsed.data.rawCommand,
        parsed_intent: parsed.data.parsedIntent ?? null,
        execution_status: parsed.data.executionStatus,
        created_by: req.user!.userId,
        metadata: parsed.data.metadata ?? {},
      })
      .select("*")
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error("Voice log error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



export default router;
