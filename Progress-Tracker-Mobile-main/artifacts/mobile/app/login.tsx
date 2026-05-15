import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, register } = useApp();

  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"admin" | "manager">("manager");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim() || (isRegistering && !name.trim())) {
      setError(isRegistering ? "Please enter name, email and password" : "Please enter email and password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let success = false;
      if (isRegistering) {
        success = await register(name.trim(), email.trim(), password.trim(), undefined, role);
      } else {
        success = await login(email.trim(), password.trim());
      }

      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(isRegistering ? "Registration failed" : "Invalid email or password");
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message || (isRegistering ? "Registration failed. Check your connection and try again." : "Login failed. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 28,
      paddingTop: insets.top + 20 + (Platform.OS === "web" ? 67 : 0),
      paddingBottom: insets.bottom + 40 + (Platform.OS === "web" ? 34 : 0),
    },
    logoArea: {
      alignItems: "center",
      marginBottom: 48,
    },
    logoBox: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    appName: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    tagline: {
      fontSize: 13,
      color: colors.mutedForeground,
      marginTop: 4,
    },
    formTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.mutedForeground,
      marginBottom: 6,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginBottom: 16,
      paddingHorizontal: 14,
    },
    inputWrapFocused: {
      borderColor: colors.primary,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.foreground,
    },
    eyeBtn: {
      padding: 4,
    },
    errorBox: {
      backgroundColor: colors.critical + "15",
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      color: colors.critical,
      fontSize: 13,
      fontWeight: "500",
      flex: 1,
    },
    loginBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 4,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    loginBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.primaryForeground,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 24,
      gap: 12,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontWeight: "500",
    },
    helpText: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 18,
    },
    switchModeWrap: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 20,
    },
    switchModeText: {
      color: colors.mutedForeground,
      fontSize: 14,
    },
    switchModeLink: {
      color: colors.primary,
      fontWeight: "600",
      fontSize: 14,
      marginLeft: 4,
    },
    roleToggleRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 16,
    },
    roleToggleBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingVertical: 14,
    },
    roleToggleBtnActive: {
      backgroundColor: colors.primary + "18",
      borderColor: colors.primary,
    },
    roleToggleText: {
      fontSize: 15,
      fontWeight: "500",
      color: colors.mutedForeground,
    },
    roleToggleTextActive: {
      color: colors.primary,
      fontWeight: "700",
    },
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.logoArea}>
          <View style={styles.logoBox}>
            <Feather name="command" size={36} color={colors.primaryForeground} />
          </View>
          <Text style={styles.appName}>TaskCommand</Text>
          <Text style={styles.tagline}>Centralized Team Intelligence</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(350)}>
          <Text style={styles.formTitle}>{isRegistering ? "Create Account" : "Sign In"}</Text>

          {isRegistering && (
            <>
              <Text style={styles.label}>Name</Text>
              <View style={styles.inputWrap}>
                <Feather name="user" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your Name"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>

              <Text style={styles.label}>Role</Text>
              <View style={styles.roleToggleRow}>
                <Pressable
                  style={[styles.roleToggleBtn, role === "admin" && styles.roleToggleBtnActive]}
                  onPress={() => setRole("admin")}
                >
                  <Feather name="shield" size={16} color={role === "admin" ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.roleToggleText, role === "admin" && styles.roleToggleTextActive]}>Admin</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleToggleBtn, role === "manager" && styles.roleToggleBtnActive]}
                  onPress={() => setRole("manager")}
                >
                  <Feather name="briefcase" size={16} color={role === "manager" ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.roleToggleText, role === "manager" && styles.roleToggleTextActive]}>Manager</Text>
                </Pressable>
              </View>
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputWrap}>
            <Feather name="mail" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Feather name="lock" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowPassword(s => !s)}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={colors.critical} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable style={styles.loginBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.loginBtnText}>{isRegistering ? "Sign Up" : "Sign In"}</Text>
            )}
          </Pressable>

          <View style={styles.switchModeWrap}>
            <Text style={styles.switchModeText}>
              {isRegistering ? "Already have an account?" : "Don't have an account?"}
            </Text>
            <Pressable onPress={() => {
              setIsRegistering(!isRegistering);
              setError("");
            }}>
              <Text style={styles.switchModeLink}>
                {isRegistering ? "Sign In" : "Sign Up"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Secure Access</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.helpText}>
            Sign in with your organization account. New team members are created by a Head Manager.
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
