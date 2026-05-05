import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface FilterOption {
  label: string;
  value: string;
}

interface FilterChipsProps {
  options: FilterOption[];
  selected: string;
  onSelect: (value: string) => void;
  accentColor?: string;
}

export default function FilterChips({ options, selected, onSelect, accentColor }: FilterChipsProps) {
  const colors = useColors();

  const styles = StyleSheet.create({
    scroll: {
      flexGrow: 0,
    },
    container: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 4,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: {
      backgroundColor: (accentColor ?? colors.primary) + "20",
      borderColor: accentColor ?? colors.primary,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.mutedForeground,
    },
    chipTextActive: {
      color: accentColor ?? colors.primary,
      fontWeight: "700",
    },
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View style={styles.container}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, selected === opt.value && styles.chipActive]}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, selected === opt.value && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
