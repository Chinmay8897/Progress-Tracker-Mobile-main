import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View, RefreshControl } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AddMemberModal from "@/components/AddMemberModal";
import MemberCard from "@/components/MemberCard";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function TeamScreen() {
  const colors = useColors();
  const { users, isAdmin, currentUser, refreshData } = useApp();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const teamMembers = isAdmin
    ? users.filter(u => u.id !== currentUser?.id)
    : users;
  const topPadding = insets.top + (Platform.OS === "web" ? 67 : 0);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

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
    listPad: { paddingHorizontal: 16 },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 16, paddingVertical: 14 },
    emptyState: { alignItems: "center", paddingVertical: 60 },
    emptyText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground, marginTop: 12 },
    emptySubtext: { fontSize: 13, color: colors.mutedForeground + "80", marginTop: 4 },
    bottomSpace: { height: insets.bottom + 100 + (Platform.OS === "web" ? 34 : 0) },
  });

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(300)}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Team</Text>
              <Text style={styles.headerSub}>{teamMembers.length} members</Text>
            </View>
            {isAdmin && (
              <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)}>
                <Feather name="user-plus" size={18} color={colors.primary} />
              </Pressable>
            )}
          </View>
        </View>
      </Animated.View>

      <FlatList
        data={teamMembers}
        keyExtractor={u => u.id}
        ListHeaderComponent={() => <Text style={styles.sectionTitle}>{teamMembers.length} Members</Text>}
        renderItem={({ item, index }) => (
          <View style={styles.listPad}>
            <MemberCard user={item} index={index} />
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Feather name="users" size={40} color={colors.mutedForeground + "60"} />
            <Text style={styles.emptyText}>No team members</Text>
            <Text style={styles.emptySubtext}>Add members to get started</Text>
          </View>
        )}
        ListFooterComponent={<View style={styles.bottomSpace} />}
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

      <AddMemberModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}
