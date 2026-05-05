import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FilterChips from "@/components/FilterChips";
import StatCard from "@/components/StatCard";
import TaskCard from "@/components/TaskCard";
import TaskFormModal from "@/components/TaskFormModal";
import VoiceCommandPanel from "@/components/VoiceCommandPanel";
import { Priority, TaskStatus, useApp } from "@/context/AppContext";
import { parseVoiceCommand } from "@/domain/voice/CommandParser";
import { createTaskFromVoiceCommand, type TaskVoicePrefill } from "@/domain/voice/TaskService";
import { useColors } from "@/hooks/useColors";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";

type FilterType = "all" | Priority | TaskStatus | string;

const PRIORITY_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Blocked", value: "blocked" },
  { label: "Done", value: "done" },
];

export default function DashboardScreen() {
  const colors = useColors();
  const { tasks, users, currentUser, isHeadManager, addTask } = useApp();
  const insets = useSafeAreaInsets();

  const [priorityFilter, setPriorityFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [actionTaken, setActionTaken] = useState<string | null>(null);
  const [voicePrefill, setVoicePrefill] = useState<TaskVoicePrefill | null>(null);
  const [voiceModalPrompt, setVoiceModalPrompt] = useState<string | null>(null);

  const myTasks = isHeadManager ? tasks : tasks.filter(t => t.assigneeId === currentUser?.id);

  const stats = useMemo(() => ({
    total: myTasks.length,
    critical: myTasks.filter(t => t.priority === "critical" && t.status !== "done").length,
    inProgress: myTasks.filter(t => t.status === "in_progress").length,
    blocked: myTasks.filter(t => t.status === "blocked").length,
    done: myTasks.filter(t => t.status === "done").length,
  }), [myTasks]);

  const filtered = useMemo(() => {
    let list = myTasks;
    if (priorityFilter !== "all") list = list.filter(t => t.priority === priorityFilter);
    if (statusFilter !== "all") list = list.filter(t => t.status === statusFilter);
    if (assigneeFilter !== "all") list = list.filter(t => t.assigneeId === assigneeFilter);
    return list.sort((a, b) => {
      const PO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (PO[a.priority] ?? 4) - (PO[b.priority] ?? 4);
    });
  }, [myTasks, priorityFilter, statusFilter, assigneeFilter]);

  const teamMembers = users.filter(u => u.role !== "head_manager");
  const assigneeOptions = [
    { label: "All", value: "all" },
    ...teamMembers.map(u => ({ label: u.name.split(" ")[0], value: u.id })),
  ];

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPadding = insets.bottom + 100 + (Platform.OS === "web" ? 34 : 0);

  const processCommand = useCallback((text: string) => {
    const rawText = text.trim();
    if (!rawText) return;

    setActionTaken(null);

    void (async () => {
      try {
        const parsed = parseVoiceCommand(rawText, {
          knownUsers: users.map(u => ({ name: u.name })),
        });

        let action: string | null = null;
        let haptics: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success;

        if (parsed.kind === "clear_filters") {
          setPriorityFilter("all");
          setStatusFilter("all");
          setAssigneeFilter("all");
          action = "All filters cleared";
        } else if (parsed.kind === "set_priority_filter") {
          setPriorityFilter(parsed.priority);
          setStatusFilter("all");
          action = parsed.priority === "all" ? "Priority filter cleared" : `Filtered by ${parsed.priority} priority`;
        } else if (parsed.kind === "set_status_filter") {
          setStatusFilter(parsed.status);
          setPriorityFilter("all");
          action = parsed.status === "all" ? "Status filter cleared" : `Filtered by ${String(parsed.status).replace(/_/g, " ")}`;
        } else if (parsed.kind === "open_task_form") {
          setVoicePrefill(null);
          setVoiceModalPrompt(null);
          setShowModal(true);
          action = "Opened new task form";
        } else if (parsed.kind === "create_task") {
          if (!currentUser) {
            action = "Please log in to create tasks.";
            haptics = Haptics.NotificationFeedbackType.Error;
          } else {
            const result = await createTaskFromVoiceCommand({
              command: parsed.command,
              users,
              currentUser,
              addTask,
            });

            if (result.kind === "created") {
              action = result.message;
            } else if (result.kind === "needs_info") {
              setVoicePrefill(result.prefill);
              setVoiceModalPrompt(result.message);
              setShowModal(true);
              action = result.message;
            } else {
              action = result.message;
              haptics = Haptics.NotificationFeedbackType.Error;
            }
          }
        } else {
          action = "Could not understand that command.";
          haptics = Haptics.NotificationFeedbackType.Error;
        }

        setActionTaken(action);
        Haptics.notificationAsync(haptics);
      } catch {
        setActionTaken("Something went wrong while processing that command.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    })();
  }, [users, currentUser, addTask]);

  const { start, finish, stop, status: voiceStatus, transcript, error, isSupported } = useVoiceCommand({
    onResult: processCommand,
    onEnd: () => {},
  });

  const handleVoiceFab = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (showVoicePanel) {
      stop();
      setShowVoicePanel(false);
      setActionTaken(null);
    } else {
      setActionTaken(null);
      setShowVoicePanel(true);
      // Auto-start listening if supported
      if (isSupported) {
        setTimeout(() => start(), 300);
      }
    }
  };

  const handleCloseVoice = () => {
    stop();
    setShowVoicePanel(false);
    setActionTaken(null);
  };

  const voiceActive = showVoicePanel;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPadding + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.header,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    greeting: { fontSize: 12, color: colors.headerForeground + "99", fontWeight: "500" },
    headerTitle: { fontSize: 24, fontWeight: "800", color: colors.headerForeground, marginTop: 2 },
    badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    badge: {
      backgroundColor: colors.primary + "30",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    badgeText: { fontSize: 11, fontWeight: "700", color: colors.primary },
    statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
    sectionPad: { paddingHorizontal: 16, marginBottom: 8 },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
    listPad: { paddingHorizontal: 16 },
    emptyState: { alignItems: "center", paddingVertical: 48 },
    emptyIcon: { marginBottom: 12 },
    emptyText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, color: colors.mutedForeground + "80", marginTop: 4 },
    fab: {
      position: "absolute",
      right: 20,
      bottom: bottomPadding - 70,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    },
    voiceFab: {
      position: "absolute",
      left: 20,
      bottom: bottomPadding - 70,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: voiceActive ? colors.critical : colors.card,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: voiceActive ? colors.critical : "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: voiceActive ? 0.35 : 0.15,
      shadowRadius: 8,
      elevation: 6,
      borderWidth: 1.5,
      borderColor: voiceActive ? colors.critical : colors.border,
    },
    filterSection: { paddingHorizontal: 16, marginBottom: 6 },
    filterLabel: { fontSize: 10, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
    voicePanelWrapper: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
    },
  });

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(300)}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.headerTitle}>
                {isHeadManager ? "Command Center" : currentUser?.name?.split(" ")[0]}
              </Text>
            </View>
            <View style={styles.badgeRow}>
              {stats.critical > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.critical + "30" }]}>
                  <Text style={[styles.badgeText, { color: colors.critical }]}>{stats.critical} Critical</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Animated.View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        ListHeaderComponent={() => (
          <>
            <View style={styles.statsRow}>
              <StatCard label="Total" value={stats.total} color={colors.primary} index={0} />
              <StatCard label="Active" value={stats.inProgress} color={colors.inProgress} index={1} />
              <StatCard label="Blocked" value={stats.blocked} color={colors.blocked} index={2} />
              <StatCard label="Done" value={stats.done} color={colors.done} index={3} />
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Priority</Text>
              <FilterChips options={PRIORITY_OPTIONS} selected={priorityFilter} onSelect={setPriorityFilter} />
            </View>
            <View style={[styles.filterSection, { marginTop: 8 }]}>
              <Text style={styles.filterLabel}>Status</Text>
              <FilterChips options={STATUS_OPTIONS} selected={statusFilter} onSelect={setStatusFilter} accentColor={colors.inProgress} />
            </View>
            {isHeadManager && (
              <View style={[styles.filterSection, { marginTop: 8, marginBottom: 14 }]}>
                <Text style={styles.filterLabel}>Assignee</Text>
                <FilterChips options={assigneeOptions} selected={assigneeFilter} onSelect={setAssigneeFilter} accentColor={colors.done} />
              </View>
            )}
            {!isHeadManager && <View style={{ height: 14 }} />}

            <View style={styles.sectionPad}>
              <Text style={styles.sectionTitle}>{filtered.length} Tasks</Text>
            </View>
          </>
        )}
        renderItem={({ item, index }) => (
          <View style={styles.listPad}>
            <TaskCard task={item} index={index} />
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="check-circle" size={40} color={colors.mutedForeground + "60"} />
            </View>
            <Text style={styles.emptyText}>No tasks found</Text>
            <Text style={styles.emptySubtext}>Adjust filters or create a new task</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      />

      {/* Voice FAB — head manager only */}
      {isHeadManager && (
        <Pressable style={styles.voiceFab} onPress={handleVoiceFab}>
          <Feather
            name="mic"
            size={22}
            color={voiceActive ? colors.destructiveForeground : colors.mutedForeground}
          />
        </Pressable>
      )}

      {/* Add task FAB — head manager only */}
      {isHeadManager && (
        <Pressable style={styles.fab} onPress={() => {
          setVoicePrefill(null);
          setVoiceModalPrompt(null);
          setShowModal(true);
        }}>
          <Feather name="plus" size={24} color={colors.primaryForeground} />
        </Pressable>
      )}

      {/* Voice command panel — head manager only */}
      {isHeadManager && showVoicePanel && (
        <Animated.View entering={FadeInUp.duration(250)} style={styles.voicePanelWrapper}>
          <VoiceCommandPanel
            status={voiceStatus}
            transcript={transcript}
            error={error}
            actionTaken={actionTaken}
            onStartListening={start}
            onFinishListening={finish}
            onClose={handleCloseVoice}
            onManualCommand={processCommand}
            isSupported={isSupported}
          />
        </Animated.View>
      )}

      <TaskFormModal
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          setVoicePrefill(null);
          setVoiceModalPrompt(null);
        }}
        defaultAssigneeId={voicePrefill?.assigneeId}
        defaultDueDate={voicePrefill?.dueDate}
        defaultTitle={voicePrefill?.title}
        defaultDescription={voicePrefill?.description}
        defaultPriority={voicePrefill?.priority}
        initialError={voiceModalPrompt}
      />
    </View>
  );
}
