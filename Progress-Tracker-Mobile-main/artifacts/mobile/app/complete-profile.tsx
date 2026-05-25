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

export default function CompleteProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, updateProfile, logout } = useApp();

  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const phone = whatsappNumber.trim().replace(/\D/g, ""); // Strip non-digits
    
    if (!phone) {
      setError("WhatsApp number is required");
      return;
    }
    if (phone.length !== 10) {
      setError("Mobile number must be exactly 10 digits");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await updateProfile({ phoneNumber: phone });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message || "Failed to update profile. Try again.");
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
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: colors.mutedForeground,
      marginBottom: 24,
      lineHeight: 20,
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
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.foreground,
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
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    submitBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.primaryForeground,
    },
    profilePreview: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 12,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    avatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 16,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.foreground,
    },
    profileEmail: {
      fontSize: 13,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    logoutBtn: {
      marginTop: 24,
      alignItems: "center",
      paddingVertical: 12,
    },
    logoutText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontWeight: "500",
    }
  });

  if (!currentUser) return null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.logoArea}>
          <View style={styles.logoBox}>
            <Feather name="command" size={36} color={colors.primaryForeground} />
          </View>
          <Text style={styles.appName}>TaskCommand</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(350)}>
          <Text style={styles.formTitle}>Almost there!</Text>
          <Text style={styles.description}>
            We need your WhatsApp number to enable task sharing and team communication.
          </Text>

          <View style={styles.profilePreview}>
            <View style={[styles.avatarPlaceholder, { backgroundColor: currentUser.avatarColor || colors.primary }]}>
              <Text style={styles.avatarText}>{currentUser.name?.charAt(0).toUpperCase() || "U"}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{currentUser.name}</Text>
              <Text style={styles.profileEmail}>{currentUser.email}</Text>
            </View>
          </View>

          <Text style={styles.label}>WhatsApp Number</Text>
          <View style={styles.inputWrap}>
            <Feather name="phone" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
            <Text style={{ fontSize: 15, color: colors.foreground, marginRight: 4, fontWeight: "600" }}>+91</Text>
            <TextInput
              style={styles.input}
              value={whatsappNumber}
              onChangeText={(text) => {
                let digits = text.replace(/\D/g, "");
                if (digits.startsWith("91") && digits.length > 10) {
                  digits = digits.substring(2);
                }
                if (digits.length <= 10) setWhatsappNumber(digits);
              }}
              placeholder="1234567890"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
            />
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={colors.critical} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.submitBtnText}>Complete Profile</Text>
            )}
          </Pressable>

          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Cancel & Logout</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
