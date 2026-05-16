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
import { UserRole, useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface AddMemberModalProps {
  visible: boolean;
  onClose: () => void;
}

const BASE_ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
];

export default function AddMemberModal({ visible, onClose }: AddMemberModalProps) {
  const colors = useColors();
  const { addUser, currentUser, users } = useApp();
  const insets = useSafeAreaInsets();

  const roleOptions: { value: UserRole; label: string }[] =
    currentUser?.role === "admin"
      ? BASE_ROLES
      : BASE_ROLES;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("manager");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);

    if (!name.trim()) {
      setError("Full name is required");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    // Check for duplicate email
    if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      setError("A member with this email already exists");
      return;
    }
    if (!password.trim()) {
      setError("Password is required");
      return;
    }
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    const phone = phoneNumber.trim().replace(/\D/g, "");
    if (phone && phone.length !== 10) {
      setError("Mobile number must be exactly 10 digits");
      return;
    }
    if (!phone) {
      setError("Mobile number is required");
      return;
    }

    await addUser({
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      role,
      avatarColor: "#1a6cf5",
      phoneNumber: phone || undefined,
    });
    setName(""); setEmail(""); setPhoneNumber(""); setPassword(""); setRole("manager"); setError(null);
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
    errorBox: { backgroundColor: colors.critical + "10", borderWidth: 1, borderColor: colors.critical + "35", borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 },
    errorText: { flex: 1, color: colors.critical, fontSize: 12, fontWeight: "600" },
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
            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color={colors.critical} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Jane Smith" placeholderTextColor={colors.mutedForeground} />
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="jane@company.com" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" />
            <View style={styles.formGroup}>
            <Text style={styles.label}>Indian Mobile Number</Text>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 16,
              marginBottom: 16
            }}>
              <Text style={{ fontSize: 15, color: colors.foreground, marginRight: 8, fontWeight: "600" }}>+91</Text>
              <TextInput
                style={[styles.input, { borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0, flex: 1, marginBottom: 0 }]}
                value={phoneNumber}
                onChangeText={(text) => {
                  let digits = text.replace(/\D/g, "");
                  if (digits.startsWith("91") && digits.length > 10) {
                    digits = digits.substring(2);
                  }
                  if (digits.length <= 10) setPhoneNumber(digits);
                }}
                placeholder="8897425370"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={10}
              />
            </View>
          </View>
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
