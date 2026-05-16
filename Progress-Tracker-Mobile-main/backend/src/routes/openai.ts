/**
 * AI provider proxy.
 *
 * Route path remains `/api/openai/*` for backward compatibility with clients.
 *
 * ARCHITECTURE NOTE (v2):
 * The `/transcribe` endpoint has been REMOVED. Voice commands now use
 * on-device speech recognition (expo-speech-recognition). Audio is never
 * uploaded to the backend. Only text commands are sent for parsing.
 *
 * Remaining endpoint:
 * - `/chat` uses Groq Chat Completions (OpenAI-compatible API surface)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { openaiLimiter } from "../middleware/rateLimit.js";

const router = Router();
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const SUPPORTED_GROQ_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "mixtral-8x7b-32768",
]);

// ─── API Key Guard ───────────────────────────────────────────────────────────

function getGroqKey(res: Response): string | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "Groq chat integration is not configured. Set GROQ_API_KEY in backend .env.",
    });
    return null;
  }
  return apiKey;
}

// ─── Chat Completions (Groq LLM) ─────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(10_000),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  model: z.string().max(100).optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(4096).default(1024),
});

router.post(
  "/chat",
  requireAuth,
  openaiLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const apiKey = getGroqKey(res);
      if (!apiKey) return;

      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { messages, model, temperature, max_tokens } = parsed.data;
      const envDefaultModel = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";
      const requestedModel = (model ?? envDefaultModel).trim();
      const effectiveModel = SUPPORTED_GROQ_MODELS.has(requestedModel)
        ? requestedModel
        : envDefaultModel;
      const groqBaseUrl = (process.env.GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL).replace(/\/+$/, "");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25_000);
      const response = await fetch(`${groqBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages,
          temperature,
          max_tokens,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        let details = "";
        try {
          const errJson = await response.json() as any;
          details = errJson?.error?.message ?? "";
        } catch {
          // ignore
        }
        console.error(`Groq chat failed (${response.status}): ${details}`);
        res.status(response.status >= 500 ? 502 : response.status).json({
          error: `Chat request failed${details ? `: ${details}` : ""}`,
        });
        return;
      }

      const result = await response.json() as any;
      res.json({
        message: result?.choices?.[0]?.message?.content ?? "",
        usage: result?.usage ?? null,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        res.status(504).json({ error: "Chat request timed out" });
        return;
      }
      console.error("Groq chat proxy error:", err);
      res.status(500).json({ error: "Chat service unavailable" });
    }
  },
);

export default router;
