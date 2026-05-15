import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { UserRole, User } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

interface MemberCardProps {
  user: User;
  index?: number;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
};

export default function MemberCard({ user, index = 0 }: MemberCardProps) {
  const colors = useColors();
  const { getTasksForUser } = useApp();
  const scale = useSharedValue(1);

  const userTasks = getTasksForUser(user.id);
  const openTasks = userTasks.filter(t => t.status !== "done" && t.status !== "cancelled").length;
  const criticalTasks = userTasks.filter(t => t.priority === "critical" && t.status !== "done").length;

  const initials = user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/member/[id]", params: { id: user.id } });
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      marginBottom: 10,
      padding: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: user.avatarColor,
      marginRight: 12,
    },
    avatarText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
    },
    roleBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.secondary,
      marginTop: 3,
      alignSelf: "flex-start",
    },
    roleText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.mutedForeground,
      letterSpacing: 0.3,
    },
    stats: {
      alignItems: "flex-end",
    },
    taskCount: {
      fontSize: 20,
      fontWeight: "700",
      color: openTasks > 0 ? colors.primary : colors.mutedForeground,
    },
    taskLabel: {
      fontSize: 10,
      color: colors.mutedForeground,
    },
    criticalBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      marginTop: 2,
    },
    criticalText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.critical,
    },
    chevron: {
      marginLeft: 8,
    },
  });

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <Animated.View style={animStyle}>
        <Pressable
          onPressIn={() => { scale.value = withSpring(0.98); }}
          onPressOut={() => { scale.value = withSpring(1); }}
          onPress={handlePress}
          style={styles.card}
        >
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{user.name}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{ROLE_LABELS[user.role]}</Text>
              </View>
            </View>
            <View style={styles.stats}>
              <Text style={styles.taskCount}>{openTasks}</Text>
              <Text style={styles.taskLabel}>tasks</Text>
              {criticalTasks > 0 && (
                <View style={styles.criticalBadge}>
                  <Feather name="alert-circle" size={10} color={colors.critical} />
                  <Text style={styles.criticalText}>{criticalTasks} critical</Text>
                </View>
              )}
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={styles.chevron} />
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
