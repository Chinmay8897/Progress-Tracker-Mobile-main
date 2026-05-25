/**
 * Centralized application bootstrap.
 *
 * Runs once at cold start before navigation or authenticated API usage.
 * Ensures native SDKs (Google Sign-In) and the HTTP client layer are ready.
 */

import { Platform } from "react-native";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";
import { configureApiClient } from "@/services/apiClient";
import { configureGoogleSignIn, isGoogleSignInConfigured } from "@/services/googleAuthService";

export type BootstrapPhase = "idle" | "running" | "ready" | "failed";

export interface BootstrapState {
  phase: BootstrapPhase;
  error: string | null;
  warnings: string[];
}

let bootstrapPromise: Promise<BootstrapState> | null = null;
let lastState: BootstrapState = { phase: "idle", error: null, warnings: [] };

export function getBootstrapState(): BootstrapState {
  return lastState;
}

/**
 * Initialize all app services. Safe to call multiple times; only runs once.
 */
export function bootstrapApp(): Promise<BootstrapState> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = runBootstrap().catch(err => {
    const message = err instanceof Error ? err.message : "Application startup failed";
    lastState = { phase: "failed", error: message, warnings: lastState.warnings };
    logger.error("Bootstrap", message, err);
    return lastState;
  });

  return bootstrapPromise;
}

export function resetBootstrapForRetry(): void {
  bootstrapPromise = null;
  lastState = { phase: "idle", error: null, warnings: [] };
}

async function runBootstrap(): Promise<BootstrapState> {
  lastState = { phase: "running", error: null, warnings: [] };
  const warnings: string[] = [];

  // 1. HTTP / API layer (validates base URL, marks client ready)
  configureApiClient();

  if (!config.apiBaseUrl) {
    warnings.push("API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL.");
  }

  // 2. Google Sign-In (native only — required before signIn())
  if (Platform.OS === "android" || Platform.OS === "ios") {
    configureGoogleSignIn();
    if (!isGoogleSignInConfigured()) {
      warnings.push(
        "Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and iOS client ID on iOS).",
      );
    }
  }

  // 3. Optional cold-start warmup (non-blocking for UI)
  if (config.apiBaseUrl) {
    void import("@/services/apiClient")
      .then(({ pingHealthEndpoint }) => pingHealthEndpoint())
      .catch(() => undefined);
  }

  lastState = { phase: "ready", error: null, warnings };
  logger.info("Bootstrap", "Application services initialized", {
    googleConfigured: isGoogleSignInConfigured(),
    apiBaseUrl: config.apiBaseUrl ? "set" : "missing",
  });

  return lastState;
}
