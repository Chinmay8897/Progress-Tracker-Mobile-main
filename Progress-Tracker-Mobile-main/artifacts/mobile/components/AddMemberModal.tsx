import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Role, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface AddMemberModalProps {
  visible: boolean;
  onClose: () => void;
}

const BASE_ROLES: { value: Role; label: string }[] = [
  { value: "admin_lite", label: "Admin-Lite" },
  { value: "project_lead", label: "Project Lead" },
  { value: "developer", label: "Developer" },
  { value: "support_agent", label: "Support Agent" },
];

export default function AddMemberModal({ visible, onClose }: AddMemberModalProps) {
  const colors = useColors();
  const { addUser, currentUser } = useApp();
  const insets = useSafeAreaInsets();

  const roleOptions: { value: Role; label: string }[] =
    currentUser?.role === "head_manager"
      ? [{ value: "head_manager", label: "Admin" }, ...BASE_ROLES]
      : BASE_ROLES;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("developer");

  const handleAdd = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    await addUser({ name, email, password, role, avatarColor: "#1a6cf5" });
    setName(""); setEmail(""); setPassword(""); setRole("developer");
    onClose();
  };

  const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 8 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground },
    content: { padding: 20 },
    label: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" },
    input: { backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 15, color: colors.foreground, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    roleBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border },
    roleBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "15" },
    roleText: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    roleTextActive: { color: colors.primary },
    addBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    addBtnText: { fontSize: 15, fontWeight: "700", color: colors.primaryForeground },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Team Member</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Jane Smith" placeholderTextColor={colors.mutedForeground} />
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="jane@company.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Temporary password" placeholderTextColor={colors.mutedForeground} secureTextEntry />
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleRow}>
              {roleOptions.map(r => (
                <TouchableOpacity key={r.value} style={[styles.roleBtn, role === r.value && styles.roleBtnActive]} onPress={() => setRole(r.value)}>
                  <Text style={[styles.roleText, role === r.value && styles.roleTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
              <Text style={styles.addBtnText}>Add Member</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
