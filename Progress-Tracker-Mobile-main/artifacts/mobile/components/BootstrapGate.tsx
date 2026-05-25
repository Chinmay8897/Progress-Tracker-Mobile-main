import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  bootstrapApp,
  getBootstrapState,
  resetBootstrapForRetry,
  type BootstrapState,
} from "@/services/appBootstrapService";

interface BootstrapGateProps {
  children: React.ReactNode;
}

/**
 * Blocks the app tree until centralized bootstrap completes.
 * Prevents Google Sign-In and API usage before configure() runs.
 */
export function BootstrapGate({ children }: BootstrapGateProps) {
  const [state, setState] = useState<BootstrapState>(() => getBootstrapState());

  const runBootstrap = useCallback(async () => {
    setState({ phase: "running", error: null, warnings: [] });
    const result = await bootstrapApp();
    setState(result);
  }, []);

  useEffect(() => {
    if (state.phase === "idle" || state.phase === "running") {
      void runBootstrap();
    }
  }, [runBootstrap, state.phase]);

  const handleRetry = () => {
    resetBootstrapForRetry();
    setState({ phase: "idle", error: null, warnings: [] });
  };

  if (state.phase === "failed") {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={40} color="#ef4444" />
        <Text style={styles.title}>Could not start the app</Text>
        <Text style={styles.message}>{state.error ?? "Unknown startup error"}</Text>
        <Pressable style={styles.retryBtn} onPress={handleRetry}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  if (state.phase !== "ready") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Starting TaskCommand…</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0d1117",
    paddingHorizontal: 32,
    gap: 16,
  },
  loadingText: {
    color: "#94a3b8",
    fontSize: 15,
    marginTop: 8,
  },
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  message: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#4F46E5",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
