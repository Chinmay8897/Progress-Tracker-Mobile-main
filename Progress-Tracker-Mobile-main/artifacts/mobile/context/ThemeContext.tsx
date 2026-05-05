import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { getJson, setJsonQueued } from "@/data/storage";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedColorScheme = "light" | "dark";

export interface ThemeContextValue {
  /** User-selected preference (persisted). */
  preference: ThemePreference;
  /** Resolved effective scheme (system-aware). */
  colorScheme: ResolvedColorScheme;
  isDark: boolean;
  /** True once we have read persisted preference. */
  ready: boolean;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
}

const STORAGE_KEY = "taskcommand_theme_preference";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();

  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await getJson<unknown>(STORAGE_KEY);
        if (!cancelled && isThemePreference(stored)) {
          setPreferenceState(stored);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void setJsonQueued(STORAGE_KEY, preference);
  }, [preference, ready]);

  const colorScheme: ResolvedColorScheme = useMemo(() => {
    if (preference === "system") {
      return systemScheme === "dark" ? "dark" : "light";
    }
    return preference;
  }, [preference, systemScheme]);

  const isDark = colorScheme === "dark";

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
  };

  const toggle = () => {
    // If the user is on "system", toggling forces an explicit opposite.
    setPreferenceState(prev => {
      const currentResolved = prev === "system" ? (systemScheme === "dark" ? "dark" : "light") : prev;
      return currentResolved === "dark" ? "light" : "dark";
    });
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      colorScheme,
      isDark,
      ready,
      setPreference,
      toggle,
    }),
    [preference, colorScheme, isDark, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Optional access (does not throw if provider is missing). */
export function useThemeOptional() {
  return useContext(ThemeContext);
}

/** Required access (throws if provider is missing). */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
