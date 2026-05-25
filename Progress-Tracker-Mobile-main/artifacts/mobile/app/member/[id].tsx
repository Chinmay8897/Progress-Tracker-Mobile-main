import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TaskCard from "@/components/TaskCard";
import TaskFormModal from "@/components/TaskFormModal";
import { UserRole, TaskStatus, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { usersApi } from "@/services/api";
import { WhatsAppService } from "@/services/whatsappService";
import { formatTaskListForWhatsApp } from "@/utils/formatTaskListForWhatsApp";

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
  const { users, getTasksForUser, isAdmin, currentUser, deleteUser, updateUser, refreshData } = useApp();
  const insets = useSafeAreaInsets();
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [showTaskForm, setShowTaskForm] = useState(false);

  // ── Role management state ───────────────────────────────────────────────
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingRoleChange, setConfirmingRoleChange] = useState<UserRole | null>(null);
  const [isRoleChanging, setIsRoleChanging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);

  const member = users.find(u => u.id === id);
  const allTasks = member ? getTasksForUser(member.id) : [];
  const isSelf = currentUser?.id === member?.id;

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
  const isTargetAdmin = member.role === "admin";
  const newRole: UserRole = isTargetAdmin ? "manager" : "admin";
  const roleActionLabel = isTargetAdmin ? "Demote to Manager" : "Promote to Admin";

  // ── Feedback helper ─────────────────────────────────────────────────────
  const showFeedback = (type: "success" | "error", message: string) => {
    setActionFeedback({ type, message });
    Haptics.notificationAsync(
      type === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // ── Role change handler ─────────────────────────────────────────────────
  const handleRoleChange = async () => {
    if (!confirmingRoleChange) return;
    setIsRoleChanging(true);
    setConfirmingRoleChange(null);

    try {
      const updated = await usersApi.changeRole(member.id, confirmingRoleChange);
      // Sync the local state via updateUser (optimistic)
      await updateUser(member.id, { role: updated.role as UserRole });
      showFeedback("success", `${member.name} is now ${ROLE_LABELS[updated.role as UserRole]}.`);
    } catch (err: any) {
      showFeedback("error", err?.message || "Failed to change role. Please try again.");
    } finally {
      setIsRoleChanging(false);
    }
  };

  // ── Delete handler ──────────────────────────────────────────────────────
  const handleRemoveConfirm = async () => {
    setIsDeleting(true);
    try {
      await deleteUser(member.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      setIsDeleting(false);
      setConfirmingRemove(false);
      showFeedback("error", err?.message || "Failed to remove user. Please try again.");
    }
  };

  // ── Share Tasks handler ─────────────────────────────────────────────────
  const handleShareTasks = async () => {
    if (!member) return;
    if (sortedTasks.length === 0) {
      showFeedback("error", "No tasks to share in this view.");
      return;
    }

    setSharingWhatsApp(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const filterLabelMap: Record<string, string> = { all: "All", in_progress: "Active", blocked: "Blocked", done: "Done" };
      const activeFilterLabel = filterLabelMap[activeStatus] || "All";
      const message = formatTaskListForWhatsApp(sortedTasks, activeFilterLabel);
      await WhatsAppService.sendMessage(member, message);
    } catch (err: any) {
      showFeedback("error", err?.message || "Failed to open WhatsApp.");
    } finally {
      setSharingWhatsApp(false);
    }
  };

  // ── Initiate role change with self-protection ───────────────────────────
  const initiateRoleChange = () => {
    if (isSelf) {
      showFeedback("error", "You cannot change your own role. Ask another admin.");
      return;
    }
    setConfirmingRoleChange(newRole);
  };

  // ── Initiate delete with self-protection ────────────────────────────────
  const initiateDelete = () => {
    if (isSelf) {
      showFeedback("error", "You cannot remove yourself.");
      return;
    }
    setConfirmingRemove(true);
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
    roleChip: {
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
      backgroundColor: isTargetAdmin ? colors.critical + "20" : colors.primary + "25",
    },
    roleText: {
      fontSize: 11, fontWeight: "700",
      color: isTargetAdmin ? colors.critical : colors.primary,
    },
    email: { fontSize: 12, color: colors.headerForeground + "80", marginTop: 4 },
    actionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
    taskHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 8 },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase" },
    shareBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#25D366" + "15", borderWidth: 1, borderColor: "#25D366" + "40" },
    shareBtnText: { fontSize: 11, fontWeight: "700", color: "#25D366" },
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

    // ── Admin Actions Section ──────────────────────────────────────────────
    adminSection: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 10,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    adminSectionTitle: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.mutedForeground,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 10,
    },
    roleChangeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.primary + "12",
      marginBottom: 8,
    },
    roleChangeBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
      flex: 1,
    },
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.critical + "10",
    },
    deleteBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.critical,
      flex: 1,
    },
    disabledBtn: {
      opacity: 0.5,
    },

    // ── Confirmation Banners ──────────────────────────────────────────────
    confirmBanner: {
      margin: 16,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      padding: 14,
    },
    confirmTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
    confirmText: { fontSize: 12, color: colors.mutedForeground, marginBottom: 12 },
    confirmBtnRow: { flexDirection: "row", gap: 10 },
    confirmCancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: colors.secondary },
    confirmCancelText: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    confirmActionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
    confirmActionText: { fontSize: 13, fontWeight: "700" },

    // ── Feedback Banner ───────────────────────────────────────────────────
    feedbackBanner: {
      marginHorizontal: 16,
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    feedbackText: { fontSize: 12, fontWeight: "600", flex: 1 },
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
            {isAdmin && !isSelf && (
              <View style={styles.actionRow}>
                <Pressable style={styles.removeBtn} onPress={initiateDelete} disabled={isDeleting}>
                  {isDeleting ? (
                    <ActivityIndicator size={14} color={colors.critical} />
                  ) : (
                    <Feather name="user-minus" size={15} color={colors.critical} />
                  )}
                </Pressable>
              </View>
            )}
          </View>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{member.name}</Text>
              <View style={styles.roleBadge}>
                <View style={styles.roleChip}>
                  <Text style={styles.roleText}>
                    {isTargetAdmin ? "⚡ " : ""}{ROLE_LABELS[member.role]}
                  </Text>
                </View>
                {isSelf && (
                  <View style={[styles.roleChip, { backgroundColor: colors.done + "20" }]}>
                    <Text style={[styles.roleText, { color: colors.done }]}>You</Text>
                  </View>
                )}
              </View>
              <Text style={styles.email}>{member.email}</Text>
              {member.phoneNumber ? (
                <Text style={styles.email}>{member.phoneNumber}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </Animated.View>

      <FlatList
        data={sortedTasks}
        keyExtractor={item => item.id}
        ListHeaderComponent={() => (
          <>
            {/* Feedback Banner */}
            {actionFeedback && (
              <Animated.View entering={FadeInDown.duration(200)}>
                <View style={[
                  styles.feedbackBanner,
                  {
                    backgroundColor: actionFeedback.type === "success" ? colors.done + "15" : colors.critical + "15",
                    borderWidth: 1,
                    borderColor: actionFeedback.type === "success" ? colors.done + "40" : colors.critical + "40",
                  },
                ]}>
                  <Feather
                    name={actionFeedback.type === "success" ? "check-circle" : "alert-circle"}
                    size={14}
                    color={actionFeedback.type === "success" ? colors.done : colors.critical}
                  />
                  <Text style={[
                    styles.feedbackText,
                    { color: actionFeedback.type === "success" ? colors.done : colors.critical },
                  ]}>
                    {actionFeedback.message}
                  </Text>
                  <Pressable onPress={() => setActionFeedback(null)}>
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Role Change Confirmation */}
            {confirmingRoleChange && (
              <Animated.View entering={FadeInDown.duration(200)}>
                <View style={[styles.confirmBanner, {
                  backgroundColor: confirmingRoleChange === "admin" ? colors.primary + "08" : colors.critical + "08",
                  borderColor: confirmingRoleChange === "admin" ? colors.primary + "40" : colors.critical + "40",
                }]}>
                  <Text style={[styles.confirmTitle, {
                    color: confirmingRoleChange === "admin" ? colors.primary : colors.critical,
                  }]}>
                    {confirmingRoleChange === "admin"
                      ? `Promote ${member.name} to Admin?`
                      : `Demote ${member.name} to Manager?`
                    }
                  </Text>
                  <Text style={styles.confirmText}>
                    {confirmingRoleChange === "admin"
                      ? "This user will get full administrative access including user management."
                      : "This user will lose administrative privileges and can only manage assigned tasks."
                    }
                  </Text>
                  <View style={styles.confirmBtnRow}>
                    <Pressable
                      style={styles.confirmCancelBtn}
                      onPress={() => setConfirmingRoleChange(null)}
                    >
                      <Text style={styles.confirmCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.confirmActionBtn, {
                        backgroundColor: confirmingRoleChange === "admin" ? colors.primary : colors.critical,
                      }]}
                      onPress={handleRoleChange}
                    >
                      {isRoleChanging ? (
                        <ActivityIndicator size={14} color="#fff" />
                      ) : (
                        <Text style={[styles.confirmActionText, { color: "#fff" }]}>
                          {confirmingRoleChange === "admin" ? "Promote" : "Demote"}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Delete Confirmation */}
            {confirmingRemove && (
              <Animated.View entering={FadeInDown.duration(200)} style={[styles.confirmBanner, {
                backgroundColor: colors.critical + "10",
                borderColor: colors.critical + "40",
              }]}>
                <Text style={[styles.confirmTitle, { color: colors.critical }]}>
                  Remove {member.name}?
                </Text>
                <Text style={styles.confirmText}>
                  {isTargetAdmin
                    ? "This admin will be permanently removed from the team. Their tasks will remain."
                    : "This will remove them from the team. Their tasks will remain."
                  }
                </Text>
                <View style={styles.confirmBtnRow}>
                  <Pressable
                    onPress={() => setConfirmingRemove(false)}
                    style={styles.confirmCancelBtn}
                    disabled={isDeleting}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleRemoveConfirm}
                    style={[styles.confirmActionBtn, { backgroundColor: colors.critical }]}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size={14} color="#fff" />
                    ) : (
                      <Text style={[styles.confirmActionText, { color: colors.destructiveForeground }]}>Remove</Text>
                    )}
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Admin Actions Section */}
            {isAdmin && !isSelf && (
              <Animated.View entering={FadeInDown.delay(50).duration(250)}>
                <View style={styles.adminSection}>
                  <Text style={styles.adminSectionTitle}>Admin Actions</Text>

                  {/* Role Change Button */}
                  <Pressable
                    style={[styles.roleChangeBtn, (isRoleChanging || isDeleting) && styles.disabledBtn]}
                    onPress={initiateRoleChange}
                    disabled={isRoleChanging || isDeleting}
                  >
                    <Feather
                      name={isTargetAdmin ? "arrow-down-circle" : "arrow-up-circle"}
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={styles.roleChangeBtnText}>{roleActionLabel}</Text>
                    {isRoleChanging && <ActivityIndicator size={14} color={colors.primary} />}
                    {!isRoleChanging && <Feather name="chevron-right" size={14} color={colors.mutedForeground} />}
                  </Pressable>

                  {/* Delete Button */}
                  <Pressable
                    style={[styles.deleteBtn, (isRoleChanging || isDeleting) && styles.disabledBtn]}
                    onPress={initiateDelete}
                    disabled={isRoleChanging || isDeleting}
                  >
                    <Feather name="trash-2" size={16} color={colors.critical} />
                    <Text style={styles.deleteBtnText}>Remove from Team</Text>
                    {isDeleting && <ActivityIndicator size={14} color={colors.critical} />}
                    {!isDeleting && <Feather name="chevron-right" size={14} color={colors.mutedForeground} />}
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Self indicator for admin viewing own profile */}
            {isAdmin && isSelf && (
              <Animated.View entering={FadeInDown.delay(50).duration(250)}>
                <View style={[styles.adminSection, { borderColor: colors.done + "40" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="shield" size={14} color={colors.done} />
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, flex: 1 }}>
                      This is your account. Role and deletion changes must be made by another admin.
                    </Text>
                  </View>
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
            <View style={styles.taskHeaderRow}>
              <Text style={styles.sectionTitle}>{sortedTasks.length} Tasks</Text>
              {isAdmin && sortedTasks.length > 0 && (
                <Pressable
                  style={[styles.shareBtn, sharingWhatsApp && styles.disabledBtn]}
                  onPress={handleShareTasks}
                  disabled={sharingWhatsApp}
                >
                  <Feather name="message-circle" size={12} color="#25D366" />
                  <Text style={styles.shareBtnText}>{sharingWhatsApp ? "Opening..." : "Share Tasks"}</Text>
                </Pressable>
              )}
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
