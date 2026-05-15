import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TaskFormModal from "@/components/TaskFormModal";
import { getPriorityColor } from "@/components/TaskCard";
import { Priority, TaskStatus, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { toDateKey, parseDateKey } from "@/utils/date";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open", in_progress: "In Progress", blocked: "Blocked",
  done: "Done", cancelled: "Cancelled",
};

// toDateKey and parseDateKey imported from @/utils/date

/** Safely parse a date key, returning today if invalid. */
function parseDateKeyOrToday(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const result = new Date(y, m - 1, d);
  return Number.isNaN(result.getTime()) ? new Date() : result;
}

export default function CalendarScreen() {
  const colors = useColors();
  const { tasks, currentUser, isAdmin, movePendingToNextDay } = useApp();
  const insets = useSafeAreaInsets();

  const today = new Date();
  const todayKey = toDateKey(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [globalView, setGlobalView] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [moving, setMoving] = useState(false);
  const [movedCount, setMovedCount] = useState<number | null>(null);

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPadding = insets.bottom + 100 + (Platform.OS === "web" ? 34 : 0);

  // Apply RBAC filtering
  const visibleTasks = useMemo(() => {
    if (isAdmin && globalView) return tasks;
    return tasks.filter(t => t.assigneeId === currentUser?.id);
  }, [tasks, isAdmin, globalView, currentUser]);

  // Group tasks by date key (using dueDate)
  const tasksByDate = useMemo(() => {
    const map: Record<string, typeof tasks> = {};
    for (const t of visibleTasks) {
      const key = t.dueDate.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [visibleTasks]);

  // Build calendar grid for viewMonth/viewYear
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const grid: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDateKey(todayKey);
  };

  // Tasks for selected day
  const selectedTasks = useMemo(() => {
    const list = tasksByDate[selectedDateKey] ?? [];
    return [...list].sort((a, b) => {
      return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    });
  }, [tasksByDate, selectedDateKey]);

  // Pending tasks on selected day (not done, not cancelled)
  const pendingOnSelected = selectedTasks.filter(t => t.status !== "done" && t.status !== "cancelled");

  // "Move Pending" button visible when selected day is today or in the past AND has pending tasks
  const selectedDate = parseDateKeyOrToday(selectedDateKey);
  selectedDate.setHours(0, 0, 0, 0);
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  const isPastOrToday = selectedDate <= todayMidnight;
  const showMoveButton = isPastOrToday && pendingOnSelected.length > 0;

  const handleMoveToNextDay = async () => {
    setMoving(true);
    setMovedCount(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const count = await movePendingToNextDay(selectedDateKey);
    setMovedCount(count);
    setMoving(false);
    // Select the next day so user can see the moved tasks
    const next = new Date(parseDateKeyOrToday(selectedDateKey));
    next.setDate(next.getDate() + 1);
    setSelectedDateKey(toDateKey(next));
    if (next.getMonth() !== viewMonth) {
      setViewMonth(next.getMonth());
      setViewYear(next.getFullYear());
    }
  };

  const getPriorityDots = (dateKey: string) => {
    const dayTasks = tasksByDate[dateKey] ?? [];
    const activeTasks = dayTasks.filter(t => t.status !== "cancelled");
    const seen = new Set<Priority>();
    const dots: Priority[] = [];
    for (const p of PRIORITY_ORDER) {
      if (activeTasks.some(t => t.priority === p) && !seen.has(p)) {
        dots.push(p);
        seen.add(p);
      }
      if (dots.length >= 3) break;
    }
    return dots;
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPadding + 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.header,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    headerTitle: { fontSize: 22, fontWeight: "800", color: colors.headerForeground },
    headerSub: { fontSize: 12, color: colors.headerForeground + "80", marginTop: 1 },
    globalToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: globalView ? colors.primary + "30" : colors.headerForeground + "15",
    },
    globalToggleText: {
      fontSize: 11,
      fontWeight: "700",
      color: globalView ? colors.primary : colors.headerForeground + "80",
    },
    todayBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.headerForeground + "15",
    },
    todayBtnText: { fontSize: 11, fontWeight: "700", color: colors.headerForeground },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    monthNavBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.headerForeground + "15",
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: { fontSize: 16, fontWeight: "700", color: colors.headerForeground },
    calendarWrapper: {
      backgroundColor: colors.card,
      marginHorizontal: 0,
      paddingHorizontal: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dowRow: {
      flexDirection: "row",
      paddingTop: 10,
      paddingBottom: 4,
    },
    dowCell: {
      flex: 1,
      alignItems: "center",
    },
    dowText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
    },
    calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
    dayCell: {
      width: `${100 / 7}%` as any,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    dayInner: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    dayNumber: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.foreground,
    },
    dotsRow: {
      flexDirection: "row",
      gap: 2,
      position: "absolute",
      bottom: 3,
      alignSelf: "center",
    },
    dot: { width: 5, height: 5, borderRadius: 3 },

    // Day detail section
    dayDetailHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    dayDetailTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    dayDetailSub: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
    taskRow: {
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      overflow: "hidden",
      borderLeftWidth: 3,
    },
    taskRowInner: { padding: 12 },
    taskRowTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 4 },
    taskMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
    taskStatus: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground },
    taskPriorityBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 5,
    },
    taskPriorityText: { fontSize: 10, fontWeight: "700" },
    emptyState: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24 },
    emptyIcon: { marginBottom: 12, opacity: 0.5 },
    emptyTitle: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground },
    emptySub: { fontSize: 13, color: colors.mutedForeground + "80", marginTop: 4, textAlign: "center" },
    emptyCreateBtn: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    emptyCreateText: { fontSize: 13, fontWeight: "700", color: colors.primaryForeground },

    // Move pending button
    moveBtnWrap: { marginHorizontal: 16, marginBottom: 12 },
    moveBtn: {
      backgroundColor: colors.high + "18",
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.high + "50",
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    moveBtnIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.high + "25",
      alignItems: "center",
      justifyContent: "center",
    },
    moveBtnLabel: { fontSize: 14, fontWeight: "700", color: colors.high, flex: 1 },
    moveBtnSub: { fontSize: 11, color: colors.mutedForeground },
    movedBanner: {
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: colors.done + "15",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.done + "40",
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    movedText: { fontSize: 13, fontWeight: "600", color: colors.done },
    fab: {
      position: "absolute",
      right: 20,
      bottom: bottomPadding - 20,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    },
  });

  const selectedDisplay = parseDateKeyOrToday(selectedDateKey);
  const isSelectedToday = selectedDateKey === todayKey;

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(300)}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Calendar</Text>
              <Text style={styles.headerSub}>
                {isAdmin ? (globalView ? "All team tasks" : "My tasks only") : "My tasks"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable style={styles.todayBtn} onPress={goToToday}>
                <Text style={styles.todayBtnText}>Today</Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  style={styles.globalToggle}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setGlobalView(v => !v); }}
                >
                  <Feather name={globalView ? "globe" : "user"} size={12} color={globalView ? colors.primary : colors.headerForeground + "80"} />
                  <Text style={styles.globalToggleText}>{globalView ? "Global" : "Mine"}</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={styles.monthNav}>
            <Pressable style={styles.monthNavBtn} onPress={goToPrevMonth}>
              <Feather name="chevron-left" size={18} color={colors.headerForeground} />
            </Pressable>
            <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
            <Pressable style={styles.monthNavBtn} onPress={goToNextMonth}>
              <Feather name="chevron-right" size={18} color={colors.headerForeground} />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPadding }}>
        {/* Calendar grid */}
        <View style={styles.calendarWrapper}>
          <View style={styles.dowRow}>
            {DAYS_OF_WEEK.map(d => (
              <View key={d} style={styles.dowCell}>
                <Text style={styles.dowText}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <View key={`pad_${idx}`} style={styles.dayCell} />;
              }
              const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDateKey;
              const dots = getPriorityDots(dateKey);

              return (
                <Pressable
                  key={dateKey}
                  style={styles.dayCell}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDateKey(dateKey);
                    setMovedCount(null);
                  }}
                >
                  <View style={[
                    styles.dayInner,
                    isSelected && { backgroundColor: colors.primary },
                    isToday && !isSelected && { backgroundColor: colors.primary + "20" },
                  ]}>
                    <Text style={[
                      styles.dayNumber,
                      isSelected && { color: colors.primaryForeground, fontWeight: "800" },
                      isToday && !isSelected && { color: colors.primary, fontWeight: "700" },
                    ]}>
                      {day}
                    </Text>
                  </View>
                  {dots.length > 0 && (
                    <View style={styles.dotsRow}>
                      {dots.map((p, i) => (
                        <View
                          key={i}
                          style={[styles.dot, { backgroundColor: getPriorityColor(p, colors) }]}
                        />
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Selected Day Header */}
        <Animated.View entering={FadeInDown.duration(200)} key={selectedDateKey}>
          <View style={styles.dayDetailHeader}>
            <View>
              <Text style={styles.dayDetailTitle}>
                {isSelectedToday ? "Today" : selectedDisplay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              <Text style={styles.dayDetailSub}>
                {selectedTasks.length === 0
                  ? "No tasks scheduled"
                  : `${selectedTasks.length} task${selectedTasks.length !== 1 ? "s" : ""} · ${pendingOnSelected.length} pending`}
              </Text>
            </View>
            {isAdmin && (
              <Pressable
                style={[styles.todayBtn, { backgroundColor: colors.primary + "15" }]}
                onPress={() => setShowModal(true)}
              >
                <Text style={[styles.todayBtnText, { color: colors.primary }]}>+ Task</Text>
              </Pressable>
            )}
          </View>

          {/* Moved banner */}
          {movedCount !== null && movedCount > 0 && (
            <View style={styles.movedBanner}>
              <Feather name="check-circle" size={15} color={colors.done} />
              <Text style={styles.movedText}>
                {movedCount} task{movedCount !== 1 ? "s" : ""} moved to the next day
              </Text>
            </View>
          )}

          {/* Move Pending to Next Day button */}
          {showMoveButton && isAdmin && (
            <View style={styles.moveBtnWrap}>
              <Pressable style={styles.moveBtn} onPress={handleMoveToNextDay} disabled={moving}>
                <View style={styles.moveBtnIcon}>
                  <Feather name="skip-forward" size={16} color={colors.high} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.moveBtnLabel}>
                    {moving ? "Moving tasks…" : "Move Pending to Next Day"}
                  </Text>
                  <Text style={styles.moveBtnSub}>
                    {pendingOnSelected.length} pending task{pendingOnSelected.length !== 1 ? "s" : ""} · due date +24h
                  </Text>
                </View>
                {!moving && <Feather name="chevron-right" size={16} color={colors.high} />}
              </Pressable>
            </View>
          )}

          {/* Task list */}
          {selectedTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Feather name="calendar" size={44} color={colors.mutedForeground} />
              </View>
              <Text style={styles.emptyTitle}>No tasks scheduled</Text>
              <Text style={styles.emptySub}>Nothing due on this day. Tap below to schedule a task.</Text>
                {isAdmin && (
                <Pressable style={styles.emptyCreateBtn} onPress={() => setShowModal(true)}>
                  <Text style={styles.emptyCreateText}>Create a Task</Text>
                </Pressable>
              )}
            </View>
          ) : (
            selectedTasks.map((task, idx) => {
              const priorityColor = getPriorityColor(task.priority, colors);
              const isDone = task.status === "done" || task.status === "cancelled";
              return (
                <Animated.View
                  key={task.id}
                  entering={FadeInDown.delay(idx * 40).duration(200)}
                >
                  <Pressable
                    style={[styles.taskRow, { borderLeftColor: priorityColor }]}
                    onPress={() => router.push(`/task/${task.id}`)}
                  >
                    <View style={styles.taskRowInner}>
                      <Text
                        style={[styles.taskRowTitle, isDone && { opacity: 0.45, textDecorationLine: "line-through" }]}
                        numberOfLines={2}
                      >
                        {task.title}
                      </Text>
                      <View style={styles.taskMeta}>
                        <Text style={styles.taskStatus}>{STATUS_LABELS[task.status]}</Text>
                        <View style={[styles.taskPriorityBadge, { backgroundColor: priorityColor + "20" }]}>
                          <Text style={[styles.taskPriorityText, { color: priorityColor }]}>
                            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })
          )}
        </Animated.View>
      </ScrollView>

      {isAdmin && (
        <Pressable style={styles.fab} onPress={() => setShowModal(true)}>
          <Feather name="plus" size={22} color={colors.primaryForeground} />
        </Pressable>
      )}

      <TaskFormModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        defaultDueDate={selectedDateKey}
      />
    </View>
  );
}
