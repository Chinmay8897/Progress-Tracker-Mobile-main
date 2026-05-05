import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Priority, Task, TaskStatus } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { parseDateKey, startOfTodayLocal } from "@/utils/date";

interface TaskCardProps {
  task: Task;
  index?: number;
  onPress?: () => void;
  compact?: boolean;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export function getPriorityColor(priority: Priority, colors: ReturnType<typeof useColors>) {
  switch (priority) {
    case "critical": return colors.critical;
    case "high": return colors.high;
    case "medium": return colors.medium;
    case "low": return colors.low;
  }
}

export function getStatusColor(status: TaskStatus, colors: ReturnType<typeof useColors>) {
  switch (status) {
    case "open": return colors.open;
    case "in_progress": return colors.inProgress;
    case "blocked": return colors.blocked;
    case "done": return colors.done;
    case "cancelled": return colors.cancelled;
  }
}

export default function TaskCard({ task, index = 0, onPress, compact = false }: TaskCardProps) {
  const colors = useColors();
  const { users } = useApp();
  const scale = useSharedValue(1);

  const assignee = users.find(u => u.id === task.assigneeId);
  const priorityColor = getPriorityColor(task.priority, colors);
  const statusColor = getStatusColor(task.status, colors);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.push({ pathname: "/task/[id]", params: { id: task.id } });
    }
  };

  const dueDateObj = parseDateKey(task.dueDate) ?? new Date(task.dueDate);
  const isOverdue = !Number.isNaN(dueDateObj.getTime()) && dueDateObj < startOfTodayLocal() && task.status !== "done" && task.status !== "cancelled";
  const dueDateFormatted = !Number.isNaN(dueDateObj.getTime())
    ? dueDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : task.dueDate;

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      marginBottom: 10,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    priorityBar: {
      width: 4,
      backgroundColor: priorityColor,
    },
    content: {
      flex: 1,
      padding: compact ? 12 : 14,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    title: {
      fontSize: compact ? 13 : 14,
      fontWeight: "600",
      color: colors.foreground,
      flex: 1,
      lineHeight: 20,
    },
    priorityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: priorityColor + "20",
      marginLeft: 8,
    },
    priorityText: {
      fontSize: 10,
      fontWeight: "700",
      color: priorityColor,
      letterSpacing: 0.3,
    },
    description: {
      fontSize: 12,
      color: colors.mutedForeground,
      lineHeight: 17,
      marginBottom: 10,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: statusColor + "15",
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: statusColor,
    },
    statusText: {
      fontSize: 11,
      fontWeight: "600",
      color: statusColor,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: "auto",
    },
    assigneeAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: assignee?.avatarColor ?? colors.primary,
    },
    avatarText: {
      fontSize: 9,
      fontWeight: "700",
      color: "#fff",
    },
    dueDate: {
      fontSize: 11,
      color: isOverdue ? colors.critical : colors.mutedForeground,
      fontWeight: isOverdue ? "600" : "400",
    },
    row: {
      flexDirection: "row",
    },
  });

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
      <Animated.View style={animStyle}>
        <Pressable
          onPressIn={() => { scale.value = withSpring(0.98); }}
          onPressOut={() => { scale.value = withSpring(1); }}
          onPress={handlePress}
          style={styles.card}
        >
          <View style={styles.row}>
            <View style={styles.priorityBar} />
            <View style={styles.content}>
              <View style={styles.header}>
                <Text style={styles.title} numberOfLines={compact ? 1 : 2}>{task.title}</Text>
                <View style={styles.priorityBadge}>
                  <Text style={styles.priorityText}>{PRIORITY_LABELS[task.priority].toUpperCase()}</Text>
                </View>
              </View>
              {!compact && task.description ? (
                <Text style={styles.description} numberOfLines={2}>{task.description}</Text>
              ) : null}
              <View style={styles.footer}>
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{STATUS_LABELS[task.status]}</Text>
                </View>
                <View style={styles.metaRow}>
                  {assignee && (
                    <View style={styles.assigneeAvatar}>
                      <Text style={styles.avatarText}>
                        {assignee.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </Text>
                    </View>
                  )}
                  <Feather name="calendar" size={11} color={isOverdue ? colors.critical : colors.mutedForeground} />
                  <Text style={styles.dueDate}>{dueDateFormatted}</Text>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
