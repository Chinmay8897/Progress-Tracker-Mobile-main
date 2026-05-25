import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FilterChips from "@/components/FilterChips";
import StatCard from "@/components/StatCard";
import TaskCard from "@/components/TaskCard";
import TaskFormModal from "@/components/TaskFormModal";
import VoiceCommandPanel from "@/components/VoiceCommandPanel";
import { Priority, TaskStatus, useApp } from "@/context/AppContext";
import { parseCommandAsync } from "@/domain/voice/CommandParser";
import { executeCommand, type ExecutionContext } from "@/domain/voice/CommandExecutor";
import { requiresConfirmation, type ParsedCommand, type TaskPrefill } from "@/domain/voice/types";
import { useColors } from "@/hooks/useColors";
import { useVoiceCommand } from "@/hooks/useVoiceCommand";
import { voiceLogsApi } from "@/services/api";

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
  const { tasks, users, currentUser, isAdmin, addTask, updateTask, moveTaskToDate, deleteTask, refreshData } = useApp();
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);


  const [priorityFilter, setPriorityFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [actionTaken, setActionTaken] = useState<string | null>(null);
  const [voicePrefill, setVoicePrefill] = useState<TaskPrefill | null>(null);
  const [voiceModalPrompt, setVoiceModalPrompt] = useState<string | null>(null);

  // Confirmation flow state
  const [pendingCommand, setPendingCommand] = useState<ParsedCommand | null>(null);
  const [globalView, setGlobalView] = useState(false);
  const executingCommandRef = useRef<string | null>(null);
  const voiceStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleTasks = useMemo(() => {
    if (globalView) return tasks;
    return tasks.filter(t => t.assigneeId === currentUser?.id);
  }, [tasks, globalView, currentUser]);

  const stats = useMemo(() => ({
    total: visibleTasks.length,
    critical: visibleTasks.filter(t => t.priority === "critical" && t.status !== "done").length,
    inProgress: visibleTasks.filter(t => t.status === "in_progress").length,
    blocked: visibleTasks.filter(t => t.status === "blocked").length,
    done: visibleTasks.filter(t => t.status === "done").length,
  }), [visibleTasks]);

  const filtered = useMemo(() => {
    let list = visibleTasks;
    if (priorityFilter !== "all") list = list.filter(t => t.priority === priorityFilter);
    if (statusFilter !== "all") list = list.filter(t => t.status === statusFilter);
    if (assigneeFilter !== "all") list = list.filter(t => t.assigneeId === assigneeFilter);
    return list.sort((a, b) => {
      // Primary: latest created first
      const dateCompare = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (dateCompare !== 0) return dateCompare;
      // Secondary: higher priority first (tiebreaker)
      const PO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (PO[a.priority] ?? 4) - (PO[b.priority] ?? 4);
    });
  }, [visibleTasks, priorityFilter, statusFilter, assigneeFilter]);

  const teamMembers = users;
  const assigneeOptions = [
    { label: "All", value: "all" },
    ...teamMembers.map(u => ({ label: u.name.split(" ")[0], value: u.id })),
  ];

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPadding = insets.bottom + 100 + (Platform.OS === "web" ? 34 : 0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  // ── Build execution context ───────────────────────────────────────────────

  const buildExecCtx = useCallback((): ExecutionContext | null => {
    if (!currentUser) return null;
    return { users, tasks, currentUser, addTask, updateTask, moveTaskToDate, deleteTask };
  }, [users, tasks, currentUser, addTask, updateTask, moveTaskToDate, deleteTask]);

  // ── Execute a parsed command ──────────────────────────────────────────────

  const runCommand = useCallback(async (cmd: ParsedCommand) => {
    const executionKey = `${cmd.intent}:${cmd.rawText.trim().toLowerCase()}`;
    if (executingCommandRef.current === executionKey) {
      return;
    }
    executingCommandRef.current = executionKey;

    const ctx = buildExecCtx();
    if (!ctx) {
      executingCommandRef.current = null;
      setActionTaken("Please log in to use voice commands.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      const result = await executeCommand(cmd, ctx);
      let haptic = Haptics.NotificationFeedbackType.Success;
      let executionStatus: "succeeded" | "failed" | "needs_info" = "succeeded";

      switch (result.kind) {
        case "created":
        case "updated":
        case "moved":
        case "whatsapp_sent":
          setActionTaken(result.message);
          break;
        case "filters_cleared":
          setPriorityFilter("all");
          setStatusFilter("all");
          setAssigneeFilter("all");
          setActionTaken(result.message);
          break;
        case "filter_applied":
          if (result.filterType === "priority") {
            setPriorityFilter(result.filterValue);
            setStatusFilter("all");
          } else {
            setStatusFilter(result.filterValue);
            setPriorityFilter("all");
          }
          setActionTaken(result.message);
          break;
        case "form_opened":
          setVoicePrefill(result.prefill);
          setVoiceModalPrompt(null);
          setShowModal(true);
          setActionTaken(result.message);
          break;
        case "needs_info":
          setVoicePrefill(result.prefill);
          setVoiceModalPrompt(result.message);
          setShowModal(true);
          setActionTaken(result.message);
          haptic = Haptics.NotificationFeedbackType.Warning;
          executionStatus = "needs_info";
          break;
        case "error":
          setActionTaken(result.message);
          haptic = Haptics.NotificationFeedbackType.Error;
          executionStatus = "failed";
          break;
      }

      void voiceLogsApi.log({
        rawCommand: cmd.rawText,
        parsedIntent: cmd.intent,
        executionStatus,
        metadata: { resultKind: result.kind },
      }).catch(() => undefined);
      Haptics.notificationAsync(haptic);
    } catch (err) {
      void voiceLogsApi.log({
        rawCommand: cmd.rawText,
        parsedIntent: cmd.intent,
        executionStatus: "failed",
      }).catch(() => undefined);
      console.error("Voice Command Error:", err);
      setActionTaken("Something went wrong. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTimeout(() => {
        if (executingCommandRef.current === executionKey) {
          executingCommandRef.current = null;
        }
      }, 1500);
    }
  }, [buildExecCtx]);

  // ── Process incoming text (from voice or manual input) ────────────────────

  const processCommand = useCallback(async (text: string) => {
    const raw = text.trim();
    if (!raw) return;

    setActionTaken(null);
    setPendingCommand(null);

    const parsed = await parseCommandAsync(raw, {
      knownUsers: users.map(u => ({ name: u.name })),
    });

    // If it's a mutation command, show confirmation first
    if (requiresConfirmation(parsed.intent)) {
      setPendingCommand(parsed);
      return;
    }

    // Non-mutation commands execute immediately
    void runCommand(parsed);
  }, [users, runCommand]);

  // ── Confirmation handlers ─────────────────────────────────────────────────

  const handleConfirm = useCallback(() => {
    if (!pendingCommand) return;
    const cmd = pendingCommand;
    setPendingCommand(null);
    void runCommand(cmd);
  }, [pendingCommand, runCommand]);

  const handleDismiss = useCallback(() => {
    if (pendingCommand) {
      void voiceLogsApi.log({
        rawCommand: pendingCommand.rawText,
        parsedIntent: pendingCommand.intent,
        executionStatus: "cancelled",
      }).catch(() => undefined);
    }
    setPendingCommand(null);
    setActionTaken("Command cancelled.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [pendingCommand]);

  // ── Voice hook ────────────────────────────────────────────────────────────

  const { start, finish, stop, status: voiceStatus, transcript, error, isSupported } = useVoiceCommand({
    onResult: processCommand,
    onEnd: () => {},
  });

  const handleVoiceFab = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (showVoicePanel) {
      if (voiceStartTimerRef.current) {
        clearTimeout(voiceStartTimerRef.current);
        voiceStartTimerRef.current = null;
      }
      stop();
      setShowVoicePanel(false);
      setActionTaken(null);
      setPendingCommand(null);
    } else {
      setActionTaken(null);
      setPendingCommand(null);
      setShowVoicePanel(true);
      if (isSupported) {
        if (voiceStartTimerRef.current) {
          clearTimeout(voiceStartTimerRef.current);
        }
        voiceStartTimerRef.current = setTimeout(() => {
          voiceStartTimerRef.current = null;
          start();
        }, 300);
      }
    }
  };

  const handleCloseVoice = () => {
    if (voiceStartTimerRef.current) {
      clearTimeout(voiceStartTimerRef.current);
      voiceStartTimerRef.current = null;
    }
    stop();
    setShowVoicePanel(false);
    setActionTaken(null);
    setPendingCommand(null);
  };

  React.useEffect(() => {
    return () => {
      if (voiceStartTimerRef.current) {
        clearTimeout(voiceStartTimerRef.current);
        voiceStartTimerRef.current = null;
      }
    };
  }, []);

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
      bottom: bottomPadding - 20,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
    },
    voiceFab: {
      position: "absolute",
      left: 20,
      bottom: bottomPadding - 20,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: voiceActive ? colors.critical : colors.card,
      alignItems: "center", justifyContent: "center",
      shadowColor: voiceActive ? colors.critical : "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: voiceActive ? 0.35 : 0.15,
      shadowRadius: 8, elevation: 6,
      borderWidth: 1.5,
      borderColor: voiceActive ? colors.critical : colors.border,
    },
    globalToggle: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    },
    globalToggleText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    filterSection: { paddingHorizontal: 16, marginBottom: 6 },
    filterLabel: { fontSize: 10, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
    voicePanelWrapper: {
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 100,
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
                {isAdmin ? "Dashboard" : currentUser?.name?.split(" ")[0]}
              </Text>
            </View>
            <View style={styles.badgeRow}>
              <Pressable
                style={styles.globalToggle}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGlobalView(v => !v);
                }}
              >
                <Feather name={globalView ? "globe" : "user"} size={14} color={globalView ? colors.primary : colors.mutedForeground} />
                <Text style={styles.globalToggleText}>{globalView ? "Global" : "My Tasks"}</Text>
              </Pressable>
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
        extraData={{ users, priorityFilter, statusFilter, assigneeFilter, stats }}
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
            {isAdmin && (
              <View style={[styles.filterSection, { marginTop: 8, marginBottom: 14 }]}>
                <Text style={styles.filterLabel}>Assignee</Text>
                <FilterChips options={assigneeOptions} selected={assigneeFilter} onSelect={setAssigneeFilter} accentColor={colors.done} />
              </View>
            )}
            {!isAdmin && <View style={{ height: 14 }} />}

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

      {/* Voice FAB — admin only */}
      {isAdmin && (
        <Pressable style={styles.voiceFab} onPress={handleVoiceFab}>
          <Feather
            name="mic"
            size={22}
            color={voiceActive ? colors.destructiveForeground : colors.mutedForeground}
          />
        </Pressable>
      )}

      {/* Add task FAB — admin only */}
      {isAdmin && (
        <Pressable style={styles.fab} onPress={() => {
          setVoicePrefill(null);
          setVoiceModalPrompt(null);
          setShowModal(true);
        }}>
          <Feather name="plus" size={24} color={colors.primaryForeground} />
        </Pressable>
      )}

      {/* Voice command panel — admin only */}
      {isAdmin && showVoicePanel && (
        <Animated.View entering={FadeInUp.duration(250)} style={styles.voicePanelWrapper}>
          <VoiceCommandPanel
            status={voiceStatus}
            transcript={transcript}
            error={error}
            actionTaken={actionTaken}
            pendingCommand={pendingCommand}
            onStartListening={start}
            onFinishListening={finish}
            onClose={handleCloseVoice}
            onManualCommand={processCommand}
            onConfirm={handleConfirm}
            onDismiss={handleDismiss}
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
