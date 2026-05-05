import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, type ThemePreference } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

export interface ThemePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: keyof typeof Feather.glyphMap }>= [
  { value: "system", label: "System", icon: "smartphone" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

export default function ThemePickerModal({ visible, onClose }: ThemePickerModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = useTheme();

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: insets.bottom + 16,
      maxHeight: "75%",
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.foreground,
    },
    closeBtn: {
      padding: 4,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginHorizontal: 16,
      marginTop: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      gap: 12,
    },
    optionActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "12",
    },
    optionIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.secondary,
    },
    optionLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: "700",
      color: colors.foreground,
    },
    optionSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    checkWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "20",
    },
  });

  const getSub = (v: ThemePreference) => {
    switch (v) {
      case "system":
        return "Match device setting";
      case "light":
        return "Light background";
      case "dark":
        return "Dark background";
    }
  };

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === "web" ? "fade" : "slide"}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
            <Text style={styles.headerTitle}>Appearance</Text>
            <View style={{ width: 30 }} />
          </View>

          {OPTIONS.map(opt => {
            const active = preference === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => {
                  setPreference(opt.value);
                  onClose();
                }}
              >
                <View style={styles.optionIconWrap}>
                  <Feather name={opt.icon} size={18} color={active ? colors.primary : colors.mutedForeground} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  <Text style={styles.optionSub}>{getSub(opt.value)}</Text>
                </View>

                {active ? (
                  <View style={styles.checkWrap}>
                    <Feather name="check" size={16} color={colors.primary} />
                  </View>
                ) : (
                  <View style={{ width: 28, height: 28 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
