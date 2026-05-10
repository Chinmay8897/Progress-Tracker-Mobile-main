import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

const STORAGE_PREFIX = "taskcommand_supabase_auth_";

const memoryStorage = new Map<string, string>();

const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return memoryStorage.get(key) ?? null;
    return SecureStore.getItemAsync(`${STORAGE_PREFIX}${key}`);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      memoryStorage.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(`${STORAGE_PREFIX}${key}`, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      memoryStorage.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(`${STORAGE_PREFIX}${key}`);
  },
};

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    logger.warn("Supabase", "Realtime disabled because Supabase env vars are not configured.");
    return null;
  }

  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: Platform.OS === "web" ? AsyncStorage : secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}

export async function setSupabaseSession(accessToken: string, refreshToken: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    logger.warn("Supabase", "Could not bind Supabase realtime session", error);
  }
}

export async function clearSupabaseSession(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut().catch(() => undefined);
}
