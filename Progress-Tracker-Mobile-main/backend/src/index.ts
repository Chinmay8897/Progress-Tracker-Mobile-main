/**
 * TaskCommand Backend Server
 *
 * Production-grade Express API with:
 * - Supabase Auth session validation
 * - Rate limiting
 * - CORS protection
 * - Helmet security headers
 * - AI provider proxy
 * - Supabase Auth + PostgreSQL
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { generalLimiter } from "./middleware/rateLimit.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import taskRoutes from "./routes/tasks.js";
import openaiRoutes from "./routes/openai.js";
import eventRoutes from "./routes/events.js";
import deviceTokenRoutes from "./routes/deviceToken.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── Security Middleware ─────────────────────────────────────────────────────

// Helmet adds security headers (XSS, CSP, etc.)
app.use(helmet());

// CORS — restrict to known origins
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:8081,http://localhost:19006")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ─── Health Check (Cold Start Mitigation) ────────────────────────────────────
// Placed before body parsers and rate limiters for maximum speed
app.get("/api/health", (req, res) => {
  console.log(`[Health] Ping received from ${req.ip || "unknown"} - Status: Active`);
  res.status(200).json({ 
    status: "ok", 
    service: "TaskCommand API",
    timestamp: new Date().toISOString() 
  });
});

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// General rate limiter
app.use(generalLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/openai", openaiRoutes);
app.use("/api", eventRoutes);
app.use("/api", deviceTokenRoutes);


// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global Error Handler ────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);

  if (err.message === "Not allowed by CORS") {
    res.status(403).json({ error: "CORS: Origin not allowed" });
    return;
  }

  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 TaskCommand API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   CORS origins: ${allowedOrigins.join(", ")}\n`);
});

export default app;
