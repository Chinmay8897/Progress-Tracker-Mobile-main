/**
 * Secure token storage using expo-secure-store.
 *
 * Falls back to in-memory storage on web (expo-secure-store is native-only).
 * NEVER stores tokens in AsyncStorage.
 *
 * Stores:
 * - JWT access token (short-lived, ~15m)
 * - Refresh token (long-lived, ~30d)
 * - Non-sensitive user profile data
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "taskcommand_jwt_token";
const REFRESH_TOKEN_KEY = "taskcommand_refresh_token";
const USER_KEY = "taskcommand_user_data";

// In-memory fallback for web (secure-store is native only)
const memoryStore = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return memoryStore.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// ─── Access Token ────────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await deleteItem(TOKEN_KEY);
}

// ─── Refresh Token ───────────────────────────────────────────────────────────

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await deleteItem(REFRESH_TOKEN_KEY);
}

// ─── User Profile (non-sensitive) ────────────────────────────────────────────

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  phoneNumber?: string;
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const raw = await getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: StoredUser): Promise<void> {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function clearStoredUser(): Promise<void> {
  await deleteItem(USER_KEY);
}

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * Clear all stored session data (access token, refresh token, user profile).
 * Call on logout or when session is invalidated.
 */
export async function clearSession(): Promise<void> {
  await clearToken();
  await clearRefreshToken();
  await clearStoredUser();
}
