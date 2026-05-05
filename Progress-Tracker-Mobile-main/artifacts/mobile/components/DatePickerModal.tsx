import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  type DateKey,
  normalizeDateKey,
  parseDateKey,
  toDateKey,
  todayDateKey,
} from "@/utils/date";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (dateKey: DateKey) => void | Promise<void>;
  initialDateKey?: string;
  allowPastDates?: boolean;
  title?: string;
}

export default function DatePickerModal({
  visible,
  onClose,
  onSelect,
  initialDateKey,
  allowPastDates = true,
  title = "Select date",
}: DatePickerModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const todayKey = todayDateKey();
  const initialKey = useMemo<DateKey>(() => {
    return normalizeDateKey(initialDateKey ?? "") ?? todayKey;
  }, [initialDateKey, todayKey]);

  const [viewYear, setViewYear] = useState(() => (parseDateKey(initialKey) ?? new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (parseDateKey(initialKey) ?? new Date()).getMonth());
  const [selectedKey, setSelectedKey] = useState<DateKey>(initialKey);

  useEffect(() => {
    if (!visible) return;
    const d = parseDateKey(initialKey) ?? new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedKey(initialKey);
  }, [visible, initialKey]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const grid: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handlePick = (dateKey: DateKey) => {
    setSelectedKey(dateKey);
    try {
      const maybePromise = onSelect(dateKey);
      if (maybePromise && typeof (maybePromise as { then?: unknown }).then === "function") {
        void (maybePromise as Promise<void>).catch(() => undefined);
      }
    } catch {
      // Swallow to keep the picker non-blocking; callers can surface errors via UI if desired.
    } finally {
      onClose();
    }
  };

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
      maxHeight: "92%",
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
      fontWeight: "700",
      color: colors.foreground,
    },
    closeBtn: {
      padding: 4,
    },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.foreground,
    },
    dowRow: {
      flexDirection: "row",
      paddingHorizontal: 10,
      paddingBottom: 6,
    },
    dowCell: {
      flex: 1,
      alignItems: "center",
    },
    dowText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 10,
      paddingBottom: 10,
    },
    dayCell: {
      width: `${100 / 7}%` as any,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    dayInner: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    dayText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.foreground,
    },
    dayDisabled: {
      opacity: 0.35,
    },
    daySelected: {
      backgroundColor: colors.primary + "25",
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    daySelectedText: {
      color: colors.primary,
      fontWeight: "800",
    },
  });

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
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={{ width: 30 }} />
          </View>

          <View style={styles.navRow}>
            <Pressable style={styles.navBtn} onPress={goPrevMonth}>
              <Feather name="chevron-left" size={18} color={colors.foreground} />
            </Pressable>

            <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>

            <Pressable style={styles.navBtn} onPress={goNextMonth}>
              <Feather name="chevron-right" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.dowRow}>
            {DAYS_OF_WEEK.map(d => (
              <View key={d} style={styles.dowCell}>
                <Text style={styles.dowText}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {calendarDays.map((day, idx) => {
              if (!day) {
                return <View key={`empty_${idx}`} style={styles.dayCell} />;
              }

              const dateKey = toDateKey(new Date(viewYear, viewMonth, day));
              const isDisabled = !allowPastDates && dateKey < todayKey;
              const isSelected = dateKey === selectedKey;

              return (
                <View key={dateKey} style={styles.dayCell}>
                  <Pressable
                    disabled={isDisabled}
                    onPress={() => handlePick(dateKey)}
                    style={[
                      styles.dayInner,
                      isSelected && styles.daySelected,
                      isDisabled && styles.dayDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isSelected && styles.daySelectedText,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
