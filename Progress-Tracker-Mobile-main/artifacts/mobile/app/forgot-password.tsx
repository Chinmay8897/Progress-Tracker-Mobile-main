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
import { useColors } from "@/hooks/useColors";
import { authApi } from "@/services/api";

type Step = "request" | "verify" | "reset";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleRequestOtp = async () => {
    if (!email.trim()) {
      setError("Please enter your registered email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authApi.forgotPassword(email.trim());
      setStep("verify");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim().length !== 6) {
      setError("OTP must be exactly 6 digits");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authApi.verifyOtp(email.trim(), otp.trim());
      setStep("reset");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authApi.resetPassword(email.trim(), newPassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessMsg("Password reset successfully! Redirecting...");
      setTimeout(() => {
        router.replace("/login");
      }, 2000);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 28,
      paddingTop: insets.top + 20,
      paddingBottom: insets.bottom + 40,
    },
    backBtn: {
      position: "absolute",
      top: insets.top + 20,
      left: 20,
      padding: 10,
      zIndex: 10,
    },
    logoArea: { alignItems: "center", marginBottom: 40 },
    logoBox: {
      width: 72, height: 72, borderRadius: 20,
      backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
      marginBottom: 16,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
    },
    title: { fontSize: 24, fontWeight: "800", color: colors.foreground, marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginBottom: 32, paddingHorizontal: 20 },
    label: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase" },
    inputWrap: {
      flexDirection: "row", alignItems: "center", backgroundColor: colors.card,
      borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
      marginBottom: 16, paddingHorizontal: 14,
    },
    input: { flex: 1, paddingVertical: 14, fontSize: 15, color: colors.foreground },
    eyeBtn: { padding: 4 },
    errorBox: {
      backgroundColor: colors.critical + "15", borderRadius: 10, padding: 12,
      marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8,
    },
    errorText: { color: colors.critical, fontSize: 13, fontWeight: "500", flex: 1 },
    successBox: {
      backgroundColor: "#10b981" + "15", borderRadius: 10, padding: 12,
      marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8,
    },
    successText: { color: "#10b981", fontSize: 13, fontWeight: "500", flex: 1 },
    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", marginTop: 4, shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground },
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <Pressable style={styles.backBtn} onPress={() => router.replace("/login")}>
        <Feather name="arrow-left" size={24} color={colors.foreground} />
      </Pressable>
      
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeIn.duration(400)} style={styles.logoArea}>
          <View style={styles.logoBox}>
            <Feather name="shield" size={32} color={colors.primaryForeground} />
          </View>
          <Text style={styles.title}>Account Recovery</Text>
          <Text style={styles.subtitle}>
            {step === "request" && "Enter your email to receive a secure OTP."}
            {step === "verify" && "Enter the 6-digit code sent to your email."}
            {step === "reset" && "Create a new strong password for your account."}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(350)}>
          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={colors.critical} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {!!successMsg && (
            <View style={styles.successBox}>
              <Feather name="check-circle" size={14} color="#10b981" />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          )}

          {step === "request" && (
            <>
              <Text style={styles.label}>Registered Email</Text>
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
                />
              </View>
              <Pressable style={styles.primaryBtn} onPress={handleRequestOtp} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>Send Verification Code</Text>}
              </Pressable>
            </>
          )}

          {step === "verify" && (
            <>
              <Text style={styles.label}>6-Digit OTP</Text>
              <View style={styles.inputWrap}>
                <Feather name="key" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="123456"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
              <Pressable style={styles.primaryBtn} onPress={handleVerifyOtp} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>Verify Code</Text>}
              </Pressable>
            </>
          )}

          {step === "reset" && (
            <>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.inputWrap}>
                <Feather name="lock" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowPassword(s => !s)}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <Pressable style={styles.primaryBtn} onPress={handleResetPassword} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>Reset Password</Text>}
              </Pressable>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
