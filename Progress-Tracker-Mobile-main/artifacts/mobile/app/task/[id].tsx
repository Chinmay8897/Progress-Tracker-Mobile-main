import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DatePickerModal from "@/components/DatePickerModal";
import TaskFormModal from "@/components/TaskFormModal";
import { getPriorityColor, getStatusColor } from "@/components/TaskCard";
import { Priority, TaskStatus, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseDateKey, startOfTodayLocal } from "@/utils/date";
import { shareToWhatsApp } from "@/utils/whatsapp";
import { WhatsAppService } from "@/services/whatsappService";
import { formatTaskMessage } from "@/utils/formatTaskMessage";
import { Alert } from "react-native";

const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
};
const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open", in_progress: "In Progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled",
};

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { tasks, users, deleteTask, isAdmin, updateTask, moveTaskToDate } = useApp();
  const insets = useSafeAreaInsets();
  const [showEdit, setShowEdit] = useState(false);
  const [showMoveDate, setShowMoveDate] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const task = tasks.find(t => t.id === id);
  const assignee = task ? users.find(u => u.id === task.assigneeId) : null;

  if (!task) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.mutedForeground }}>Task not found</Text>
      </View>
    );
  }

  const priorityColor = getPriorityColor(task.priority, colors);
  const statusColor = getStatusColor(task.status, colors);
  const dueDateObj = parseDateKey(task.dueDate) ?? new Date(task.dueDate);
  const todayStart = startOfTodayLocal();
  const isOverdue = !Number.isNaN(dueDateObj.getTime()) && dueDateObj < todayStart && task.status !== "done" && task.status !== "cancelled";
  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);

  const handleMoveToDate = (dateKey: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void moveTaskToDate(task.id, dateKey).catch(() => undefined);
  };

  const handleShare = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const dueLabel = !Number.isNaN(dueDateObj.getTime())
      ? dueDateObj.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
      : task.dueDate;

    const lines = [
      `Task: ${task.title}`,
      assignee ? `Assignee: ${assignee.name}` : undefined,
      `Status: ${STATUS_LABELS[task.status]}`,
      `Priority: ${PRIORITY_LABELS[task.priority]}`,
      `Due: ${dueLabel}`,
      task.description ? "" : undefined,
      task.description ? task.description : undefined,
    ].filter(Boolean) as string[];

    await shareToWhatsApp(lines.join("\n"));
  };

  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  const handleWhatsAppShare = () => {
    if (!assignee) return;

    Alert.alert(
      "Share via WhatsApp",
      `Send task to ${assignee.name.split(' ')[0]} on WhatsApp?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Send", 
          style: "default",
          onPress: async () => {
            setSendingWhatsApp(true);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            
            try {
              const message = formatTaskMessage(task);
              await WhatsAppService.sendMessage(assignee, message);
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("WhatsApp Error", err.message || "Failed to open WhatsApp.");
            } finally {
              setSendingWhatsApp(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await deleteTask(task.id);
    router.back();
  };

  const quickStatus = async (s: TaskStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateTask(task.id, { status: s });
  };

  const STATUSES: TaskStatus[] = ["open", "in_progress", "blocked", "done", "cancelled"];

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPadding + 8,
      paddingHorizontal: 16,
      paddingBottom: 16,
      backgroundColor: colors.header,
    },
    backRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
    backText: { fontSize: 14, color: colors.headerForeground + "99" },
    actionRow: { flexDirection: "row", gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.headerForeground + "15", alignItems: "center", justifyContent: "center" },
    deleteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.critical + "30", alignItems: "center", justifyContent: "center" },
    priorityBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
      backgroundColor: priorityColor + "25", alignSelf: "flex-start", marginBottom: 10,
    },
    priorityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: priorityColor },
    priorityText: { fontSize: 11, fontWeight: "700", color: priorityColor, textTransform: "uppercase" },
    title: { fontSize: 22, fontWeight: "800", color: colors.headerForeground, lineHeight: 28 },
    content: { padding: 16 },
    card: { backgroundColor: colors.card, borderRadius: colors.radius, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
    statusRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    statusChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
    statusText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    metaLabel: { width: 80, fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    metaValue: { fontSize: 13, color: colors.foreground, fontWeight: "500" },
    assigneeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: assignee?.avatarColor ?? colors.primary, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    descText: { fontSize: 14, color: colors.foreground, lineHeight: 22 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.secondary },
    tagText: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground },
    notesText: { fontSize: 14, color: colors.foreground, lineHeight: 21 },
    dateText: { fontSize: 13, color: isOverdue ? colors.critical : colors.foreground, fontWeight: "500" },
    overdueText: { fontSize: 11, color: colors.critical, fontWeight: "600" },

    moveDateBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: "flex-start",
    },
    moveDateText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.foreground,
    },

    whatsappBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "#25D366",
      paddingVertical: 12,
      borderRadius: 10,
      marginTop: 16,
    },
    whatsappText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#fff",
    },

    // Inline delete confirmation
    deleteConfirmCard: {
      backgroundColor: colors.critical + "10",
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.critical + "40",
      padding: 14,
      marginBottom: 12,
    },
    deleteConfirmTitle: { fontSize: 14, fontWeight: "700", color: colors.critical, marginBottom: 4 },
    deleteConfirmSub: { fontSize: 12, color: colors.mutedForeground, marginBottom: 12 },
    deleteConfirmButtons: { flexDirection: "row", gap: 10 },
    cancelDeleteBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10,
      alignItems: "center", backgroundColor: colors.secondary,
    },
    cancelDeleteText: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    confirmDeleteBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10,
      alignItems: "center", backgroundColor: colors.critical,
    },
    confirmDeleteText: { fontSize: 13, fontWeight: "700", color: colors.destructiveForeground },
  });

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(250)}>
        <View style={styles.header}>
          <View style={styles.backRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Feather name="arrow-left" size={16} color={colors.headerForeground + "99"} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <Pressable style={styles.actionBtn} onPress={handleShare}>
                <Feather name="share-2" size={15} color={colors.headerForeground} />
              </Pressable>
              {isAdmin && (
                <>
                  <Pressable style={styles.actionBtn} onPress={() => setShowEdit(true)}>
                    <Feather name="edit-2" size={15} color={colors.headerForeground} />
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => setConfirmingDelete(true)}
                  >
                    <Feather name="trash-2" size={15} color={colors.critical} />
                  </Pressable>
                </>
              )}
            </View>
          </View>
          <View style={styles.priorityBadge}>
            <View style={styles.priorityDot} />
            <Text style={styles.priorityText}>{PRIORITY_LABELS[task.priority]}</Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 + (Platform.OS === "web" ? 34 : 0) }}
      >
        {/* Inline delete confirmation */}
        {confirmingDelete && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.deleteConfirmCard}>
            <Text style={styles.deleteConfirmTitle}>Delete this task?</Text>
            <Text style={styles.deleteConfirmSub}>This cannot be undone. The task will be permanently removed.</Text>
            <View style={styles.deleteConfirmButtons}>
              <Pressable
                style={styles.cancelDeleteBtn}
                onPress={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                <Text style={styles.cancelDeleteText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmDeleteBtn}
                onPress={handleDeleteConfirm}
                disabled={deleting}
              >
                <Text style={styles.confirmDeleteText}>{deleting ? "Deleting…" : "Delete Task"}</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(100).duration(300)}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusRow}>
              {STATUSES.map(s => (
                <Pressable
                  key={s}
                  style={[styles.statusChip, task.status === s && { borderColor: getStatusColor(s, colors), backgroundColor: getStatusColor(s, colors) + "15" }]}
                  onPress={() => quickStatus(s)}
                >
                  <Text style={[styles.statusText, task.status === s && { color: getStatusColor(s, colors) }]}>
                    {STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(300)}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Assignee</Text>
              <View style={styles.assigneeRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{assignee?.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</Text>
                </View>
                <Text style={styles.metaValue}>{assignee?.name ?? "Unassigned"}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Due Date</Text>
              <View>
                <Text style={styles.dateText}>
                  {!Number.isNaN(dueDateObj.getTime())
                    ? dueDateObj.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
                    : task.dueDate}
                </Text>
                {isOverdue && <Text style={styles.overdueText}>Overdue</Text>}
              </View>
            </View>

            <View style={[styles.metaRow, { marginBottom: 0 }]}>
              <View style={{ width: 80 }} />
              <Pressable style={styles.moveDateBtn} onPress={() => setShowMoveDate(true)}>
                <Feather name="calendar" size={14} color={colors.mutedForeground} />
                <Text style={styles.moveDateText}>Move to date</Text>
              </Pressable>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Created</Text>
              <Text style={styles.metaValue}>{new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Text>
            </View>

            {isAdmin && assignee && (
              <Pressable 
                style={[styles.whatsappBtn, sendingWhatsApp && { opacity: 0.7 }]} 
                onPress={handleWhatsAppShare}
                disabled={sendingWhatsApp}
              >
                <Feather name="message-circle" size={16} color="#fff" />
                <Text style={styles.whatsappText}>
                  {sendingWhatsApp ? "Opening..." : "Send via WhatsApp"}
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>

        {task.description ? (
          <Animated.View entering={FadeInDown.delay(200).duration(300)}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descText}>{task.description}</Text>
            </View>
          </Animated.View>
        ) : null}

        {task.tags.length > 0 && (
          <Animated.View entering={FadeInDown.delay(250).duration(300)}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagRow}>
                {task.tags.map(tag => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        )}

        {task.notes ? (
          <Animated.View entering={FadeInDown.delay(300).duration(300)}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.notesText}>{task.notes}</Text>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      <TaskFormModal visible={showEdit} onClose={() => setShowEdit(false)} editTask={task} />

      <DatePickerModal
        visible={showMoveDate}
        onClose={() => setShowMoveDate(false)}
        title="Move to date"
        initialDateKey={task.dueDate}
        allowPastDates={false}
        onSelect={handleMoveToDate}
      />
    </View>
  );
}
