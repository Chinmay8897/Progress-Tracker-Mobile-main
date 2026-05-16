/**
 * Centralized environment configuration.
 *
 * All env-dependent values are accessed through this module so that
 * components never reference `process.env` directly.
 *
 * SECURITY: The API key is NOT stored here.
 * It lives server-side only in the backend .env file.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";

// We cannot use dynamic `process.env[key]` access because Metro bundler
// replaces these statically at build time. They must be explicitly written out.
function getExpoEnvVar(key: string, staticValue: string | undefined): string {
  if (staticValue) return staticValue.trim();

  // Fallback to Constants.expoConfig.extra if not injected by Metro
  const fromExpoExtra = (Constants.expoConfig as any)?.extra?.[key] as string | undefined;
  if (fromExpoExtra) return fromExpoExtra.trim();

  return "";
}

function normalizeApiBaseUrl(url: string): string {
  let trimmed = url.trim();
  if (!trimmed) return "";
  trimmed = trimmed.replace(/\/+$/, "");

  // Android emulator cannot reach the host machine via "localhost".
  // Rewrite to 10.0.2.2 (the emulator's special alias for host loopback).
  if (Platform.OS === "android") {
    trimmed = trimmed
      .replace("://localhost", "://10.0.2.2")
      .replace("://127.0.0.1", "://10.0.2.2");
  }

  return trimmed;
}

export const config = {
  /** Base URL for the backend API (e.g., http://192.168.1.100:3001). */
  apiBaseUrl: normalizeApiBaseUrl(getExpoEnvVar("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL)),

  /** Supabase project URL. Safe to expose in Expo public config. */
  supabaseUrl: getExpoEnvVar("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),

  /** Supabase anon key. Safe to expose; database access is still governed by RLS. */
  supabaseAnonKey: getExpoEnvVar("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),

  /** Whether the app is running in development mode. */
  isDev: typeof __DEV__ !== "undefined" ? __DEV__ : true,
} as const;

