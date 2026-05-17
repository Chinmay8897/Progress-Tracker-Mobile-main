import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { apiEventEmitter } from "@/services/apiClient";
import { Feather } from "@expo/vector-icons";

export function ColdStartOverlay() {
  const colors = useColors();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = apiEventEmitter.subscribe((waking) => {
      setIsVisible(waking);
    });
    return () => { unsubscribe(); };
  }, []);

  if (!isVisible) return null;

  const styles = StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      zIndex: 9999,
      justifyContent: "center",
      alignItems: "center",
    },
    card: {
      backgroundColor: colors.card,
      padding: 32,
      borderRadius: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 10,
      width: "80%",
      maxWidth: 320,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary + "15",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: 12,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
    },
  });

  return (
    <Animated.View 
      entering={FadeIn.duration(300)} 
      exiting={FadeOut.duration(300)} 
      style={styles.overlay}
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={styles.title}>Server is waking up...</Text>
        <Text style={styles.subtitle}>
          We are hosted on a free tier. The first request takes a few moments while the server spins up. Please hold on!
        </Text>
      </View>
    </Animated.View>
  );
}
