import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FilterChips from "@/components/FilterChips";
import TaskCard from "@/components/TaskCard";
import TaskFormModal from "@/components/TaskFormModal";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseDateKey } from "@/utils/date";

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Blocked", value: "blocked" },
  { label: "Done", value: "done" },
  { label: "Cancelled", value: "cancelled" },
];

export default function TasksScreen() {
  const colors = useColors();
  const { tasks, currentUser, isAdmin } = useApp();
  const insets = useSafeAreaInsets();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  const myTasks = isAdmin ? tasks : tasks.filter(t => t.assigneeId === currentUser?.id);

  const filtered = useMemo(() => {
    let list = myTasks;
    if (statusFilter !== "all") list = list.filter(t => t.status === statusFilter);
    return list.sort((a, b) => {
      const PO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const pd = (PO[a.priority] ?? 4) - (PO[b.priority] ?? 4);
      if (pd !== 0) return pd;
      const aTime = parseDateKey(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bTime = parseDateKey(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
  }, [myTasks, statusFilter]);

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPadding = insets.bottom + 100 + (Platform.OS === "web" ? 34 : 0);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPadding + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.header,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerTitle: { fontSize: 24, fontWeight: "800", color: colors.headerForeground },
    headerSub: { fontSize: 13, color: colors.headerForeground + "80", marginTop: 2 },
    addBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.primary + "25",
      alignItems: "center", justifyContent: "center",
    },
    filterRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 16, paddingBottom: 10 },
    listPad: { paddingHorizontal: 16 },
    emptyState: { alignItems: "center", paddingVertical: 60 },
    emptyText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground, marginTop: 12 },
    emptySubtext: { fontSize: 13, color: colors.mutedForeground + "80", marginTop: 4 },
  });

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(300)}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>All Tasks</Text>
              <Text style={styles.headerSub}>{myTasks.length} total</Text>
            </View>
            <Pressable style={styles.addBtn} onPress={() => setShowModal(true)}>
              <Feather name="plus" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        ListHeaderComponent={() => (
          <>
            <View style={styles.filterRow}>
              <FilterChips options={STATUS_OPTIONS} selected={statusFilter} onSelect={setStatusFilter} />
            </View>
            <Text style={styles.sectionTitle}>{filtered.length} Tasks</Text>
          </>
        )}
        renderItem={({ item, index }) => (
          <View style={styles.listPad}>
            <TaskCard task={item} index={index} />
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={40} color={colors.mutedForeground + "60"} />
            <Text style={styles.emptyText}>No tasks here</Text>
            <Text style={styles.emptySubtext}>Change filters or create a task</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      />

      <TaskFormModal visible={showModal} onClose={() => setShowModal(false)} />
    </View>
  );
}
