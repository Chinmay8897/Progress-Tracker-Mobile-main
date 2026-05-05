import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  label: string;
  value: number;
  color: string;
  index?: number;
}

export default function StatCard({ label, value, color, index = 0 }: StatCardProps) {
  const colors = useColors();

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      alignItems: "center",
      minWidth: 72,
      flex: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    value: {
      fontSize: 28,
      fontWeight: "700",
      color: color,
      lineHeight: 34,
    },
    label: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 2,
      letterSpacing: 0.3,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: color,
      marginBottom: 6,
    },
  });

  return (
    <Animated.View entering={FadeInRight.delay(index * 60).duration(350)} style={{ flex: 1 }}>
      <View style={styles.card}>
        <View style={styles.dot} />
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}
