/**
 * Rate limiting middleware.
 *
 * - General API: 100 requests per 15 minutes per IP
 * - Auth endpoints: 10 requests per 15 minutes per IP
 * - AI proxy: 20 requests per 15 minutes per IP
 */

import rateLimit from "express-rate-limit";

/** General API rate limiter */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/** Strict rate limiter for auth endpoints */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

/** Strict rate limiter for registration */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts, please try again later." },
});

/** Rate limiter for AI proxy */
export const openaiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many transcription requests, please try again later." },
});
