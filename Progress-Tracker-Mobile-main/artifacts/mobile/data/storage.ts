import AsyncStorage from "@react-native-async-storage/async-storage";
import { InteractionManager, Platform } from "react-native";

const writeQueueByKey = new Map<string, Promise<void>>();

function afterInteractions(): Promise<void> {
  return new Promise(resolve => {
    if (Platform.OS === "web") {
      // Yield to the browser event loop.
      setTimeout(resolve, 0);
      return;
    }

    // Defer work to avoid janking animations/gestures.
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJsonQueued(key: string, value: unknown): Promise<void> {
  const prev = writeQueueByKey.get(key) ?? Promise.resolve();

  const next = prev
    .catch(() => undefined)
    .then(async () => {
      await afterInteractions();
      const raw = JSON.stringify(value);
      await AsyncStorage.setItem(key, raw);
    });

  writeQueueByKey.set(key, next);
  return next;
}

export function removeItemQueued(key: string): Promise<void> {
  const prev = writeQueueByKey.get(key) ?? Promise.resolve();

  const next = prev
    .catch(() => undefined)
    .then(async () => {
      await afterInteractions();
      await AsyncStorage.removeItem(key);
    });

  writeQueueByKey.set(key, next);
  return next;
}
