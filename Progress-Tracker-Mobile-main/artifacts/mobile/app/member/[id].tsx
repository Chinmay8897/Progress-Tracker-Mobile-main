import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TaskCard from "@/components/TaskCard";
import TaskFormModal from "@/components/TaskFormModal";
import { UserRole, TaskStatus, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open", in_progress: "In Progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled",
};

export default function MemberProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { users, getTasksForUser, isAdmin, deleteUser } = useApp();
  const insets = useSafeAreaInsets();
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const member = users.find(u => u.id === id);
  const allTasks = member ? getTasksForUser(member.id) : [];

  const filtered = activeStatus === "all" ? allTasks : allTasks.filter(t => t.status === activeStatus);
  const sortedTasks = [...filtered].sort((a, b) => {
    const PO: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (PO[a.priority] ?? 4) - (PO[b.priority] ?? 4);
  });

  const stats = {
    total: allTasks.length,
    open: allTasks.filter(t => t.status === "open").length,
    inProgress: allTasks.filter(t => t.status === "in_progress").length,
    blocked: allTasks.filter(t => t.status === "blocked").length,
    done: allTasks.filter(t => t.status === "done").length,
  };

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPadding = insets.bottom + 40 + (Platform.OS === "web" ? 34 : 0);

  if (!member) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.mutedForeground }}>Member not found</Text>
      </View>
    );
  }

  const initials = member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const handleRemoveConfirm = async () => {
    await deleteUser(member.id);
    router.back();
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPadding + 8,
      paddingHorizontal: 16,
      paddingBottom: 20,
      backgroundColor: colors.header,
    },
    backRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
    backText: { fontSize: 14, color: colors.headerForeground + "99" },
    profileRow: { flexDirection: "row", alignItems: "center" },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: member.avatarColor, alignItems: "center", justifyContent: "center", marginRight: 16 },
    avatarText: { fontSize: 24, fontWeight: "700", color: "#fff" },
    name: { fontSize: 22, fontWeight: "800", color: colors.headerForeground },
    roleBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    roleChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.primary + "25" },
    roleText: { fontSize: 11, fontWeight: "700", color: colors.primary },
    email: { fontSize: 12, color: colors.headerForeground + "80", marginTop: 4 },
    removeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.critical + "20", alignItems: "center", justifyContent: "center" },
    statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
    statBox: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 10, alignItems: "center" },
    statValue: { fontSize: 20, fontWeight: "700" },
    statLabel: { fontSize: 9, fontWeight: "600", color: colors.mutedForeground, marginTop: 2, textTransform: "uppercase" },
    filterRow: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", gap: 8 },
    filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    filterBtnActive: { backgroundColor: colors.primary + "15", borderColor: colors.primary },
    filterText: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground },
    filterTextActive: { color: colors.primary },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 16, marginBottom: 8 },
    listPad: { paddingHorizontal: 16 },
    emptyState: { alignItems: "center", paddingVertical: 40 },
    emptyText: { fontSize: 14, color: colors.mutedForeground, marginTop: 10 },
    assignBtn: {
      position: "absolute", right: 16, bottom: bottomPadding - 40,
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20,
      flexDirection: "row", alignItems: "center", gap: 8,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    assignBtnText: { fontSize: 14, fontWeight: "700", color: colors.primaryForeground },
  });

  const FILTER_STATUSES = [
    { value: "all", label: "All" },
    { value: "in_progress", label: "Active" },
    { value: "blocked", label: "Blocked" },
    { value: "done", label: "Done" },
  ];

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(250)}>
        <View style={styles.header}>
          <View style={styles.backRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Feather name="arrow-left" size={16} color={colors.headerForeground + "99"} />
              <Text style={styles.backText}>Team</Text>
            </Pressable>
            {isAdmin && member.role !== "admin" && (
              <Pressable style={styles.removeBtn} onPress={() => setConfirmingRemove(true)}>
                <Feather name="user-minus" size={15} color={colors.critical} />
              </Pressable>
            )}
          </View>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.name}>{member.name}</Text>
              <View style={styles.roleBadge}>
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>{ROLE_LABELS[member.role]}</Text>
                </View>
              </View>
              <Text style={styles.email}>{member.email}</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      <FlatList
        data={sortedTasks}
        keyExtractor={item => item.id}
        ListHeaderComponent={() => (
          <>
            {confirmingRemove && (
              <Animated.View entering={FadeInDown.duration(200)} style={{
                margin: 16,
                backgroundColor: colors.critical + "10",
                borderRadius: colors.radius,
                borderWidth: 1.5,
                borderColor: colors.critical + "40",
                padding: 14,
              }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.critical, marginBottom: 4 }}>
                  Remove {member.name}?
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12 }}>
                  This will remove them from the team. Their tasks will remain.
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => setConfirmingRemove(false)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleRemoveConfirm}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.critical }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.destructiveForeground }}>Remove</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}
            <Animated.View entering={FadeInDown.delay(100).duration(300)}>
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>{stats.total}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.inProgress }]}>{stats.inProgress}</Text>
                  <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.blocked }]}>{stats.blocked}</Text>
                  <Text style={styles.statLabel}>Blocked</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.done }]}>{stats.done}</Text>
                  <Text style={styles.statLabel}>Done</Text>
                </View>
              </View>
            </Animated.View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {FILTER_STATUSES.map(f => (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.filterBtn, activeStatus === f.value && styles.filterBtnActive]}
                    onPress={() => setActiveStatus(f.value)}
                  >
                    <Text style={[styles.filterText, activeStatus === f.value && styles.filterTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.sectionTitle}>{sortedTasks.length} Tasks</Text>
          </>
        )}
        renderItem={({ item, index }) => (
          <View style={styles.listPad}>
            <TaskCard task={item} index={index} />
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={36} color={colors.mutedForeground + "60"} />
            <Text style={styles.emptyText}>No tasks assigned</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      />

      {isAdmin && (
        <Pressable style={styles.assignBtn} onPress={() => setShowTaskForm(true)}>
          <Feather name="plus" size={16} color={colors.primaryForeground} />
          <Text style={styles.assignBtnText}>Assign Task</Text>
        </Pressable>
      )}

      <TaskFormModal visible={showTaskForm} onClose={() => setShowTaskForm(false)} defaultAssigneeId={member.id} />
    </View>
  );
}
