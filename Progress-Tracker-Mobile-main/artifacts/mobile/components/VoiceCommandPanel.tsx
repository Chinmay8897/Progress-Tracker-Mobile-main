import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { VoiceStatus } from "@/hooks/useVoiceCommand";
import { useColors } from "@/hooks/useColors";

interface Props {
  status: VoiceStatus;
  transcript: string;
  error: string | null;
  actionTaken: string | null;
  onStartListening: () => void;
  onFinishListening: () => void;
  onClose: () => void;
  onManualCommand: (text: string) => void;
  isSupported: boolean;
}

const COMMAND_HINTS = [
  { cmd: "Add a task for Rahul to complete weekly report by May 10 with high priority and send it on WhatsApp", desc: "Create task + share on WhatsApp" },
  { cmd: "Create a task for Sam to update API docs tomorrow", desc: "Create task with a relative deadline" },
  { cmd: "Assign to Jordan to finalize roadmap by Friday", desc: "Assign task with weekday deadline" },
  { cmd: "new task", desc: "Open create task form" },
  { cmd: "show critical", desc: "Filter critical priority tasks" },
  { cmd: "show done", desc: "Filter completed tasks" },
  { cmd: "show all", desc: "Clear all filters" },
];

export default function VoiceCommandPanel({ status, transcript, error, actionTaken, onStartListening, onFinishListening, onClose, onManualCommand, isSupported }: Props) {
  const colors = useColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [manualText, setManualText] = React.useState("");

  useEffect(() => {
    if (status === "listening") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const statusColor = {
    idle: colors.mutedForeground,
    listening: colors.critical,
    processing: colors.primary,
    done: colors.done,
    error: colors.critical,
    unsupported: colors.mutedForeground,
  }[status];

  const statusLabel = {
    idle: "Ready",
    listening: "Listening...",
    processing: "Processing...",
    done: actionTaken ? "Command executed" : "Done",
    error: "Error",
    unsupported: "Not supported",
  }[status];

  const micIconForegroundColor = status === "processing"
    ? colors.primaryForeground
    : colors.destructiveForeground;

  const micDisabled = !isSupported || status === "unsupported" || status === "processing";
  const onMicPress = () => {
    if (micDisabled) return;
    if (status === "listening") {
      onFinishListening();
    } else {
      onStartListening();
    }
  };

  const styles = StyleSheet.create({
    overlay: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 16,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    titleBlock: { flex: 1 },
    title: { fontSize: 16, fontWeight: "700", color: colors.foreground },
    subtitle: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    micRow: {
      alignItems: "center",
      marginBottom: 16,
    },
    micRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: statusColor + "20",
      alignItems: "center",
      justifyContent: "center",
    },
    micInner: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: statusColor + "30",
      alignItems: "center",
      justifyContent: "center",
    },
    micIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: statusColor,
      alignItems: "center",
      justifyContent: "center",
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 10,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: statusColor,
    },
    statusText: { fontSize: 13, fontWeight: "600", color: statusColor },
    transcriptBox: {
      backgroundColor: colors.secondary,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    transcriptText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.foreground,
      textAlign: "center",
    },
    transcriptPlaceholder: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontStyle: "italic",
      textAlign: "center",
    },
    actionBox: {
      backgroundColor: colors.done + "15",
      borderRadius: 10,
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    actionText: { fontSize: 13, fontWeight: "600", color: colors.done, flex: 1 },
    errorBox: {
      backgroundColor: colors.critical + "12",
      borderRadius: 10,
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    errorText: { fontSize: 13, color: colors.critical, flex: 1 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
    hintsTitle: { fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
    hintRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      gap: 10,
    },
    hintCmd: {
      backgroundColor: colors.primary + "15",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    hintCmdText: { fontSize: 11, fontWeight: "700", color: colors.primary },
    hintDesc: { fontSize: 12, color: colors.mutedForeground },
    manualRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    manualInput: {
      flex: 1,
      backgroundColor: colors.secondary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.foreground,
      borderWidth: 1,
      borderColor: colors.border,
      outlineStyle: "none",
    } as any,
    manualBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    manualBtnText: { fontSize: 13, fontWeight: "700", color: colors.primaryForeground },
    unsupportedNote: {
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 12,
      lineHeight: 18,
    },
  });

  return (
    <View style={styles.overlay}>
      <View style={styles.handle} />

      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Voice Commands</Text>
          <Text style={styles.subtitle}>Head Manager only</Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Mic animation */}
      <View style={styles.micRow}>
        <Pressable onPress={onMicPress} disabled={micDisabled} hitSlop={12}>
          <Animated.View style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.micInner}>
              <View style={styles.micIcon}>
                <Feather name={status === "listening" ? "square" : "mic"} size={22} color={micIconForegroundColor} />
              </View>
            </View>
          </Animated.View>
        </Pressable>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      {/* Transcript */}
      <View style={styles.transcriptBox}>
        {transcript ? (
          <Text style={styles.transcriptText}>"{transcript}"</Text>
        ) : (
          <Text style={styles.transcriptPlaceholder}>
            {status === "listening" ? "Speak a command..." : status === "unsupported" || !isSupported ? "Use the text box below" : "Say a command below"}
          </Text>
        )}
      </View>

      {/* Action taken */}
      {actionTaken && status === "done" && (
        <View style={styles.actionBox}>
          <Feather name="check-circle" size={15} color={colors.done} />
          <Text style={styles.actionText}>{actionTaken}</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={15} color={colors.critical} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Manual text fallback */}
      {!isSupported && (
        <Text style={styles.unsupportedNote}>
          Voice capture isn't available here. Type a command below:
        </Text>
      )}

      <View style={styles.manualRow}>
        {Platform.OS === "web" ? (
          <input
            style={styles.manualInput}
            placeholder='e.g. "Add a task for Sam to update docs tomorrow"'
            value={manualText}
            onChange={e => setManualText((e.target as HTMLInputElement).value)}
            onKeyDown={(e: any) => {
              if (e.key === "Enter" && manualText.trim()) {
                onManualCommand(manualText.trim());
                setManualText("");
              }
            }}
          />
        ) : (
          <TextInput
            style={styles.manualInput as any}
            placeholder='e.g. "Add a task for Sam to update docs tomorrow"'
            placeholderTextColor={colors.mutedForeground}
            value={manualText}
            onChangeText={setManualText}
            onSubmitEditing={() => {
              if (manualText.trim()) {
                onManualCommand(manualText.trim());
                setManualText("");
              }
            }}
            returnKeyType="done"
          />
        )}
        <Pressable
          style={styles.manualBtn}
          onPress={() => {
            if (manualText.trim()) {
              onManualCommand(manualText.trim());
              setManualText("");
            }
          }}
        >
          <Text style={styles.manualBtnText}>Run</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      {/* Command hints */}
      <Text style={styles.hintsTitle}>Available Commands</Text>
      {COMMAND_HINTS.map(h => (
        <Pressable key={h.cmd} style={styles.hintRow} onPress={() => onManualCommand(h.cmd)}>
          <View style={styles.hintCmd}>
            <Text style={styles.hintCmdText}>"{h.cmd}"</Text>
          </View>
          <Text style={styles.hintDesc}>{h.desc}</Text>
        </Pressable>
      ))}
    </View>
  );
}
