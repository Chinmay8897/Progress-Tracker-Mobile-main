/**
 * AI provider proxy.
 *
 * Route path remains `/api/openai/*` for backward compatibility with clients.
 * Internally:
 * - `/transcribe` uses OpenAI Whisper-compatible transcription
 * - `/chat` uses Groq Chat Completions (OpenAI-compatible API surface)
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
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

type TranscriptionProviderConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

function getTranscriptionProvider(res: Response): TranscriptionProviderConfig | null {
  const openaiTranscriptionKey = process.env.OPENAI_TRANSCRIPTION_API_KEY?.trim();
  const openaiLegacyKey = process.env.OPENAI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();

  if (openaiTranscriptionKey) {
    return {
      apiKey: openaiTranscriptionKey,
      endpoint: "https://api.openai.com/v1/audio/transcriptions",
      model: "whisper-1",
    };
  }

  if (openaiLegacyKey && openaiLegacyKey.startsWith("sk-")) {
    return {
      apiKey: openaiLegacyKey,
      endpoint: "https://api.openai.com/v1/audio/transcriptions",
      model: "whisper-1",
    };
  }

  if (groqKey) {
    const groqBaseUrl = (process.env.GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL).replace(/\/+$/, "");
    return {
      apiKey: groqKey,
      endpoint: `${groqBaseUrl}/audio/transcriptions`,
      model: process.env.GROQ_TRANSCRIPTION_MODEL?.trim() || "whisper-large-v3-turbo",
    };
  }

  if (!openaiLegacyKey) {
    res.status(503).json({
      error: "Transcription provider is not configured. Set OPENAI_TRANSCRIPTION_API_KEY or GROQ_API_KEY in backend .env.",
    });
    return null;
  }

  // OPENAI_API_KEY exists but is likely not an OpenAI key format.
  res.status(503).json({
    error: "Transcription provider key is invalid for OpenAI. Use OPENAI_TRANSCRIPTION_API_KEY or configure GROQ_API_KEY with GROQ_TRANSCRIPTION_MODEL.",
  });
  return null;
}

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

// ─── Transcription (Whisper) ─────────────────────────────────────────────────

// Accept audio uploads up to 25MB (Whisper API limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/m4a", "audio/mp4", "audio/mpeg", "audio/wav",
      "audio/x-caf", "audio/aac", "audio/ogg", "audio/opus",
      "audio/webm", "audio/3gpp", "audio/3gpp2",
    ];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are accepted"));
    }
  },
});

router.post(
  "/transcribe",
  requireAuth,
  openaiLimiter,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = getTranscriptionProvider(res);
      if (!provider) return;

      if (!req.file) {
        res.status(400).json({ error: "No audio file provided" });
        return;
      }

      // Sanitize filename — strip path components, limit length
      const safeName = (req.file.originalname || "speech.m4a")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 100);

      // Build multipart form for OpenAI
      const formData = new FormData();
      formData.append("model", provider.model);
      formData.append("response_format", "json");
      formData.append(
        "file",
        new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype }),
        safeName,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      const response = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: formData,
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
        console.error(`Transcription provider failed (${response.status}): ${details}`);
        res.status(response.status >= 500 ? 502 : response.status).json({
          error: `Transcription failed${details ? `: ${details}` : ""}`,
        });
        return;
      }

      const result = await response.json() as any;
      res.json({ text: result?.text ?? "" });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        res.status(504).json({ error: "Transcription request timed out" });
        return;
      }
      console.error("Transcription proxy error:", err);
      res.status(500).json({ error: "Transcription service unavailable" });
    }
  },
);

// ─── Chat Completions (GPT) ──────────────────────────────────────────────────

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
