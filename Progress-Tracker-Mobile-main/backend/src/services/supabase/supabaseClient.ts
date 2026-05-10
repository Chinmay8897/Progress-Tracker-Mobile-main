import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

function loadDotEnvFile(): void {
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile();

if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    // Always throw in production; in dev, throw at startup time too so
    // the developer gets an immediate, clear error instead of cryptic
    // Supabase fetch failures later.
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Copy backend/.env.example to backend/.env and fill in your Supabase credentials.`,
    );
  }
  return value;
}

let supabaseUrl: string;
let serviceRoleKey: string;
let anonKey: string;

try {
  supabaseUrl = requiredEnv("SUPABASE_URL");
  serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  anonKey = requiredEnv("SUPABASE_ANON_KEY");
} catch (err) {
  console.error(`\n❌ ${(err as Error).message}\n`);
  process.exit(1);
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseAuthClient = createClient(supabaseUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
