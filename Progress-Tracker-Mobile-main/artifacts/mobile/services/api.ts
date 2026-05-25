/**
 * HTTP API client with automatic JWT attachment and token refresh.
 *
 * All API calls go through this module to ensure:
 * 1. JWT access token is always attached
 * 2. 401 responses trigger automatic token refresh
 * 3. Failed refresh triggers logout
 * 4. Errors are properly typed
 * 5. Base URL is centralized
 */

import { config } from "@/utils/config";
import { getToken, setToken, getRefreshToken, setRefreshToken, clearSession } from "@/services/auth";
import { setSupabaseSession } from "@/services/supabase/supabaseClient";
import { logger } from "@/utils/logger";
import { fetchWithRetry } from "./apiClient";

// ─── Types ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip automatic token attachment (for login/register) */
  skipAuth?: boolean;
  /** Skip automatic token refresh on 401 */
  skipRefresh?: boolean;
}

// ─── Logout callback ────────────────────────────────────────────────────────

let _onUnauthorized: (() => void) | null = null;

/**
 * Register a callback to be invoked when a 401 is received
 * and token refresh also fails.
 * Typically wired up in AppContext to trigger logout.
 */
export function setOnUnauthorized(cb: () => void): void {
  _onUnauthorized = cb;
}

// ─── Token Refresh Lock ──────────────────────────────────────────────────────

let _refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true if refresh succeeded, false otherwise.
 * Deduplicates concurrent refresh attempts.
 */
async function refreshAccessToken(): Promise<boolean> {
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) {
    return _refreshPromise;
  }

  _refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const baseUrl = config.apiBaseUrl;
      if (!baseUrl) return false;

      const response = await fetchWithRetry(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as RefreshResponse;
      await setToken(data.token);
      await setRefreshToken(data.refreshToken);
      await setSupabaseSession(data.token, data.refreshToken);

      logger.info("API", "Access token refreshed successfully");
      return true;
    } catch (err) {
      logger.error("API", "Token refresh failed", err);
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ─── Core Request Function ──────────────────────────────────────────────────

async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = config.apiBaseUrl;
  if (!baseUrl) {
    throw new ApiError(0, "API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL in your .env file.");
  }

  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Attach JWT
  if (!options.skipAuth) {
    const token = await getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  logger.debug("API", `${method} ${path}`);

  let response: Response;
  try {
    response = await fetchWithRetry(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    const baseHint = `Cannot reach API at ${baseUrl}.`;
    const isAbort = err instanceof Error && err.name === "AbortError";
    const extra = isAbort
      ? " Request timed out. Check backend server/network."
      : " Check EXPO_PUBLIC_API_BASE_URL and backend status. Server may still be waking up.";
    throw new ApiError(0, `${baseHint}${extra}`);
  }

  // Handle 401 — attempt token refresh before giving up
  if (response.status === 401 && !options.skipAuth && !options.skipRefresh) {
    logger.warn("API", "Received 401 — attempting token refresh");

    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry the original request with the new token
      return request<T>(method, path, { ...options, skipRefresh: true });
    }

    // Refresh failed — clear session and notify
    logger.warn("API", "Token refresh failed — clearing session");
    await clearSession();
    _onUnauthorized?.();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  // Parse response
  let data: any;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (${response.status})`;
    logger.warn("API", `${method} ${path} failed`, { status: response.status, message, details: data?.details });
    throw new ApiError(response.status, message, data?.details);
  }

  return data as T;
}

// ─── Public API Methods ──────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, { ...options, body }),
};

// ─── Typed Endpoint Helpers ──────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: ApiUser;
  isNewUser?: boolean;
}

export interface RegisterResponse {
  token: string;
  refreshToken: string;
  user: ApiUser;
}

export interface RefreshResponse {
  token: string;
  refreshToken: string;
  user: ApiUser;
}

export interface ChangePasswordResponse {
  token: string;
  refreshToken: string;
  message: string;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  phoneNumber?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiTask {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  priority: string;
  status: string;
  tags: string[];
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/api/auth/login", { email, password }, { skipAuth: true }),
  loginWithGoogle: (idToken: string) =>
    api.post<LoginResponse>("/api/auth/google", { idToken }, { skipAuth: true }),
  register: (name: string, email: string, password: string, phoneNumber?: string, role?: string) =>
    api.post<RegisterResponse>("/api/auth/register", { name, email, password, phoneNumber, role }, { skipAuth: true }),
  refresh: (refreshToken: string) =>
    api.post<RefreshResponse>("/api/auth/refresh", { refreshToken }, { skipAuth: true }),
  logout: () =>
    api.post<{ success: boolean }>("/api/auth/logout"),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<ChangePasswordResponse>("/api/auth/change-password", { currentPassword, newPassword }),
  me: () => api.get<ApiUser>("/api/auth/me"),
  forgotPassword: (email: string) =>
    api.post<{ success: boolean; message: string }>("/api/auth/forgot-password", { email }, { skipAuth: true }),
  verifyOtp: (email: string, code: string) =>
    api.post<{ success: boolean; message: string }>("/api/auth/verify-otp", { email, code }, { skipAuth: true }),
  resetPassword: (email: string, newPassword: string) =>
    api.post<{ success: boolean; message: string }>("/api/auth/reset-password", { email, newPassword }, { skipAuth: true }),
  updatePhone: (phoneNumber: string) =>
    api.patch<ApiUser>("/api/auth/me/phone", { phoneNumber }),
};

export const usersApi = {
  list: () => api.get<ApiUser[]>("/api/users"),
  get: (id: string) => api.get<ApiUser>(`/api/users/${id}`),
  create: (data: { name: string; email: string; password: string; role: string; avatarColor?: string; phoneNumber?: string }) =>
    api.post<ApiUser>("/api/users", data),
  update: (id: string, data: Partial<{ name: string; email: string; role: string; avatarColor: string; phoneNumber: string }>) =>
    api.put<ApiUser>(`/api/users/${id}`, data),
  delete: (id: string) => api.delete(`/api/users/${id}`),
  changeRole: (id: string, role: "admin" | "manager") =>
    api.patch<ApiUser>(`/api/users/${id}/role`, { role }),
};

export const tasksApi = {
  list: () => api.get<ApiTask[]>("/api/tasks"),
  get: (id: string) => api.get<ApiTask>(`/api/tasks/${id}`),
  create: (data: Omit<ApiTask, "id" | "createdAt" | "updatedAt" | "createdBy">) =>
    api.post<ApiTask>("/api/tasks", data),
  update: (id: string, data: Partial<ApiTask>) =>
    api.put<ApiTask>(`/api/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/api/tasks/${id}`),
  movePending: (dateKey: string) =>
    api.post<{ moved: number; newDate?: string }>("/api/tasks/move-pending", { dateKey }),
};

export const voiceLogsApi = {
  log: (data: { rawCommand: string; parsedIntent?: string | null; executionStatus: "pending" | "succeeded" | "failed" | "cancelled" | "needs_info"; metadata?: Record<string, unknown> }) =>
    api.post("/api/voice-logs", data),
};

export const notificationsApi = {
  list: () => api.get("/api/notifications"),
  log: (data: { type: string; message: string; targetUser: string; metadata?: Record<string, unknown> }) =>
    api.post("/api/notifications", data),
};

export const deviceTokensApi = {
  register: (token: string, platform?: string) =>
    api.post("/api/device-token", { token, platform }),
};
// ─── AI Proxy Helpers ────────────────────────────────────────────────────────
// AI requests go through the backend proxy.
// Provider keys are NEVER in the client bundle.
//
// NOTE: Audio transcription has been removed from the API client.
// Voice commands now use on-device speech recognition (expo-speech-recognition)
// and only send the recognized TEXT to the backend for parsing.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  message: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}

/**
 * AI proxy API — all requests routed through backend.
 * Keys stay server-side.
 */
export const openaiApi = {
  /** Chat completions via backend Groq proxy */
  chat: (
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; max_tokens?: number },
  ) =>
    api.post<ChatResponse>("/api/openai/chat", {
      messages,
      ...options,
    }),
};

export const aiApi = openaiApi;

