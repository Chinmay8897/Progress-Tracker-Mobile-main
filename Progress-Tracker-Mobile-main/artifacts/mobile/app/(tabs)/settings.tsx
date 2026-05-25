import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ThemePickerModal from "@/components/ThemePickerModal";
import EditProfileModal from "@/components/EditProfileModal";
import { UserRole, useApp } from "@/context/AppContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
};

export default function SettingsScreen() {
  const colors = useColors();
  const { currentUser, logout, tasks } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPadding = insets.bottom + 100 + (Platform.OS === "web" ? 34 : 0);

  const handleLogoutConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    logout();
  };

  const myTasks = tasks.filter(t => t.assigneeId === currentUser?.id);
  const doneTasks = myTasks.filter(t => t.status === "done").length;
  const completionRate = myTasks.length > 0 ? Math.round((doneTasks / myTasks.length) * 100) : 0;

  const initials = currentUser?.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";

  const appearanceLabel = (() => {
    switch (theme.preference) {
      case "system":
        return `System (${theme.colorScheme === "dark" ? "Dark" : "Light"})`;
      case "light":
        return "Light";
      case "dark":
        return "Dark";
    }
  })();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPadding + 16,
      paddingHorizontal: 20,
      paddingBottom: 24,
      backgroundColor: colors.header,
      alignItems: "center",
    },
    editBtn: {
      position: "absolute",
      top: topPadding + 16,
      right: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary + "15",
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: currentUser?.avatarColor ?? colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    avatarText: { fontSize: 28, fontWeight: "700", color: "#fff" },
    name: { fontSize: 20, fontWeight: "700", color: colors.headerForeground },
    email: { fontSize: 13, color: colors.headerForeground + "80", marginTop: 2 },
    roleBadge: {
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: colors.primary + "25",
    },
    roleText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    scroll: { flex: 1 },
    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    statBox: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
      alignItems: "center",
    },
    statValue: { fontSize: 24, fontWeight: "700", color: colors.foreground },
    statLabel: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
    menuItem: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      marginBottom: 8,
    },
    menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
    menuLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground },
    menuSub: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },

    // Sign out button (idle state)
    logoutItem: {
      backgroundColor: colors.critical + "10",
      borderRadius: colors.radius,
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
    },
    logoutText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.critical },

    // Confirmation row
    confirmBox: {
      backgroundColor: colors.critical + "12",
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.critical + "40",
      padding: 14,
      gap: 10,
    },
    confirmLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.critical,
      marginBottom: 2,
    },
    confirmSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginBottom: 10,
    },
    confirmButtons: {
      flexDirection: "row",
      gap: 10,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: colors.secondary,
    },
    cancelBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.foreground,
    },
    confirmSignOutBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: colors.critical,
    },
    confirmSignOutText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.destructiveForeground,
    },
  });

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(300)}>
        <View style={styles.header}>
          <Pressable style={styles.editBtn} onPress={() => setShowEditProfile(true)}>
            <Feather name="edit-2" size={16} color={colors.primary} />
          </Pressable>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{currentUser?.name}</Text>
          <Text style={styles.email}>{currentUser?.email}</Text>
          {currentUser?.phoneNumber ? (
            <Text style={styles.email}>{currentUser?.phoneNumber}</Text>
          ) : null}
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{ROLE_LABELS[currentUser?.role ?? "manager"]}</Text>
          </View>
        </View>
      </Animated.View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{myTasks.length}</Text>
              <Text style={styles.statLabel}>Tasks</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.done }]}>{doneTasks}</Text>
              <Text style={styles.statLabel}>Done</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{completionRate}%</Text>
              <Text style={styles.statLabel}>Complete</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <Pressable style={styles.menuItem} onPress={() => setShowThemePicker(true)}>
            <View style={[styles.menuIcon, { backgroundColor: colors.done + "15" }]}>
              <Feather name="moon" size={18} color={colors.done} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Appearance</Text>
              <Text style={styles.menuSub}>{appearanceLabel}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          {!confirmingLogout ? (
            <Pressable style={styles.logoutItem} onPress={() => setConfirmingLogout(true)}>
              <View style={[styles.menuIcon, { backgroundColor: colors.critical + "15" }]}>
                <Feather name="log-out" size={18} color={colors.critical} />
              </View>
              <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>
          ) : (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.confirmBox}>
              <Text style={styles.confirmLabel}>Sign out of PI?</Text>
              <Text style={styles.confirmSub}>You will need to sign in again to access your tasks.</Text>
              <View style={styles.confirmButtons}>
                <Pressable style={styles.cancelBtn} onPress={() => setConfirmingLogout(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmSignOutBtn} onPress={handleLogoutConfirm}>
                  <Text style={styles.confirmSignOutText}>Sign Out</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <ThemePickerModal visible={showThemePicker} onClose={() => setShowThemePicker(false)} />
      <EditProfileModal visible={showEditProfile} onClose={() => setShowEditProfile(false)} />
    </View>
  );
}
