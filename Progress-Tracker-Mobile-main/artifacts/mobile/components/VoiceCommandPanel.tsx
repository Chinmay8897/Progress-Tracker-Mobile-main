/**
 * VoiceCommandPanel — Voice command UI with confirmation flow.
 *
 * Features:
 * - Animated mic button with pulse
 * - Status indicator (idle/listening/processing/done/error)
 * - Live transcript display
 * - Parsed command preview before execution
 * - Confirm / Cancel buttons for mutations
 * - Manual text input fallback
 * - Command hint list
 */

import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated, Easing, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import type { VoiceStatus } from "@/hooks/useVoiceCommand";
import type { ParsedCommand } from "@/domain/voice/types";
import { requiresConfirmation, summarizeCommand } from "@/domain/voice/types";
import { useColors } from "@/hooks/useColors";

interface Props {
  status: VoiceStatus;
  transcript: string;
  error: string | null;
  actionTaken: string | null;
  /** Parsed command awaiting user confirmation (null when none pending). */
  pendingCommand: ParsedCommand | null;
  onStartListening: () => void;
  onFinishListening: () => void;
  onClose: () => void;
  onManualCommand: (text: string) => void;
  onConfirm: () => void;
  onDismiss: () => void;
  isSupported: boolean;
}

const HINTS = [
  { cmd: "Add a task for Sam to update API docs tomorrow", desc: "Create with deadline" },
  { cmd: "Assign to Jordan to finalize roadmap by Friday", desc: "Assign with weekday" },
  { cmd: "Mark testing task as completed", desc: "Update task status" },
  { cmd: "Move report task to May 20", desc: "Reschedule task" },
  { cmd: "Send tasks to Rahul on WhatsApp", desc: "Share via WhatsApp" },
  { cmd: "show critical", desc: "Filter by priority" },
  { cmd: "show done", desc: "Filter by status" },
  { cmd: "show all", desc: "Clear all filters" },
];

export default function VoiceCommandPanel({
  status, transcript, error, actionTaken, pendingCommand,
  onStartListening, onFinishListening, onClose,
  onManualCommand, onConfirm, onDismiss, isSupported,
}: Props) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [manualText, setManualText] = React.useState("");

  // Pulse animation while listening.
  useEffect(() => {
    if (status === "listening") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const statusColor: Record<VoiceStatus, string> = {
    idle: colors.mutedForeground,
    listening: colors.critical,
    processing: colors.primary,
    done: colors.done,
    error: colors.critical,
    unsupported: colors.mutedForeground,
  };

  const statusLabel: Record<VoiceStatus, string> = {
    idle: "Ready",
    listening: "Listening...",
    processing: "Processing...",
    done: actionTaken ? "Command executed" : "Done",
    error: "Error",
    unsupported: "Not supported",
  };

  const sColor = statusColor[status];
  const micDisabled = !isSupported || status === "unsupported" || status === "processing" || !!pendingCommand;

  const onMicPress = () => {
    if (micDisabled) return;
    if (status === "listening") onFinishListening();
    else onStartListening();
  };

  const showFallbackHint = (!isSupported || (error && error.includes("type your command"))) && status !== "listening";

  const s = StyleSheet.create({
    overlay: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      backgroundColor: colors.card,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20,
      shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15, shadowRadius: 12, elevation: 16,
      borderTopWidth: 1, borderColor: colors.border,
      maxHeight: "85%",
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    titleBlock: { flex: 1 },
    title: { fontSize: 16, fontWeight: "700", color: colors.foreground },
    subtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    micRow: { alignItems: "center", marginBottom: 16 },
    micRing: { width: 72, height: 72, borderRadius: 36, backgroundColor: sColor + "20", alignItems: "center", justifyContent: "center" },
    micInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: sColor + "30", alignItems: "center", justifyContent: "center" },
    micIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: sColor, alignItems: "center", justifyContent: "center" },
    statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
    statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: sColor },
    statusText: { fontSize: 13, fontWeight: "600", color: sColor },
    transcriptBox: { backgroundColor: colors.secondary, borderRadius: 12, padding: 12, marginBottom: 12, minHeight: 44, alignItems: "center", justifyContent: "center" },
    transcriptText: { fontSize: 15, fontWeight: "600", color: colors.foreground, textAlign: "center" },
    transcriptPlaceholder: { fontSize: 13, color: colors.mutedForeground, fontStyle: "italic", textAlign: "center" },
    actionBox: { backgroundColor: colors.done + "15", borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    actionText: { fontSize: 13, fontWeight: "600", color: colors.done, flex: 1 },
    errorBox: { backgroundColor: colors.critical + "12", borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    errorText: { fontSize: 13, color: colors.critical, flex: 1 },
    // Confirmation card
    confirmCard: { backgroundColor: colors.primary + "10", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.primary + "30" },
    confirmLabel: { fontSize: 11, fontWeight: "700", color: colors.primary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
    confirmText: { fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 12 },
    confirmRow: { flexDirection: "row", gap: 10 },
    confirmBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
    confirmBtnText: { fontSize: 14, fontWeight: "700", color: colors.primaryForeground },
    dismissBtn: { flex: 1, backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: colors.border },
    dismissBtnText: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
    // Fallback note
    fallbackNote: { fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginBottom: 12, lineHeight: 18 },
    // Manual input
    manualRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    manualInput: {
      flex: 1, backgroundColor: colors.secondary, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
      color: colors.foreground, borderWidth: 1, borderColor: colors.border,
      outlineStyle: "none",
    } as any,
    manualBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
    manualBtnText: { fontSize: 13, fontWeight: "700", color: colors.primaryForeground },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
    hintsTitle: { fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
    hintRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 10 },
    hintCmd: { backgroundColor: colors.primary + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 1 },
    hintCmdText: { fontSize: 11, fontWeight: "700", color: colors.primary },
    hintDesc: { fontSize: 12, color: colors.mutedForeground },
  });

  const submitManual = () => {
    if (manualText.trim()) {
      onManualCommand(manualText.trim());
      setManualText("");
    }
  };

  return (
    <View style={s.overlay}>
      <View style={s.handle} />

      <View style={s.topRow}>
        <View style={s.titleBlock}>
          <Text style={s.title}>Voice Commands</Text>
          <Text style={s.subtitle}>Head Manager only</Text>
        </View>
        <Pressable style={s.closeBtn} onPress={onClose}>
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Mic */}
      <View style={s.micRow}>
        <Pressable onPress={onMicPress} disabled={micDisabled} hitSlop={12}>
          <Animated.View style={[s.micRing, { transform: [{ scale: pulseAnim }] }]}>
            <View style={s.micInner}>
              <View style={s.micIcon}>
                <Feather
                  name={status === "listening" ? "square" : "mic"}
                  size={22}
                  color={status === "processing" ? colors.primaryForeground : colors.destructiveForeground}
                />
              </View>
            </View>
          </Animated.View>
        </Pressable>
        <View style={s.statusRow}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>{statusLabel[status]}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
        {/* Transcript */}
        <View style={s.transcriptBox}>
          {transcript ? (
            <Text style={s.transcriptText}>"{transcript}"</Text>
          ) : (
            <Text style={s.transcriptPlaceholder}>
              {status === "listening"
                ? "Speak a command..."
                : status === "error"
                ? "Try using the text box below"
                : status === "unsupported" || !isSupported
                ? "Use the text box below"
                : "Say a command below"}
            </Text>
          )}
        </View>

        {/* Pending confirmation */}
        {pendingCommand && (
          <View style={s.confirmCard}>
            <Text style={s.confirmLabel}>Confirm Command</Text>
            <Text style={s.confirmText}>{summarizeCommand(pendingCommand)}</Text>
            <View style={s.confirmRow}>
              <Pressable style={s.confirmBtn} onPress={onConfirm}>
                <Text style={s.confirmBtnText}>Confirm</Text>
              </Pressable>
              <Pressable style={s.dismissBtn} onPress={onDismiss}>
                <Text style={s.dismissBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Action result */}
        {actionTaken && !pendingCommand && status === "done" && (
          <View style={s.actionBox}>
            <Feather name="check-circle" size={15} color={colors.done} />
            <Text style={s.actionText}>{actionTaken}</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={s.errorBox}>
            <Feather name={error.includes("type your command") ? "info" : "alert-circle"} size={15} color={colors.critical} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {/* Fallback hint */}
        {showFallbackHint && (
          <Text style={s.fallbackNote}>
            {!isSupported
              ? "Voice capture isn't available here. Type a command below:"
              : "💡 Use the text input below to enter your command:"}
          </Text>
        )}

        {/* Manual input */}
        <View style={s.manualRow}>
          {Platform.OS === "web" ? (
            <input
              style={s.manualInput}
              placeholder='e.g. "Add a task for Sam to update docs tomorrow"'
              value={manualText}
              onChange={e => setManualText((e.target as HTMLInputElement).value)}
              onKeyDown={(e: any) => {
                if (e.key === "Enter") submitManual();
              }}
            />
          ) : (
            <TextInput
              style={s.manualInput as any}
              placeholder='e.g. "Add a task for Sam to update docs tomorrow"'
              placeholderTextColor={colors.mutedForeground}
              value={manualText}
              onChangeText={setManualText}
              onSubmitEditing={submitManual}
              returnKeyType="done"
            />
          )}
          <Pressable style={s.manualBtn} onPress={submitManual}>
            <Text style={s.manualBtnText}>Run</Text>
          </Pressable>
        </View>

        <View style={s.divider} />

        {/* Hints */}
        <Text style={s.hintsTitle}>Available Commands</Text>
        {HINTS.map(h => (
          <Pressable key={h.cmd} style={s.hintRow} onPress={() => onManualCommand(h.cmd)}>
            <View style={s.hintCmd}>
              <Text style={s.hintCmdText} numberOfLines={1}>"{h.cmd}"</Text>
            </View>
            <Text style={s.hintDesc}>{h.desc}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
