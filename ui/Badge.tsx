/**
 * Badge (a count pill) and Chip (a filter/label pill) — the small status vocabulary.
 *
 * Badge is for unread counts (caps at 99+); Chip is for filter strips and tags, with a
 * selected state that uses an accent tint, not raw accent (readable in both schemes).
 */

import { useColors } from '../theme/ThemeProvider';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function Badge({ count }: { count: number }) {
  const colors = useColors();
  if (count <= 0) {
    return null;
  }
  return (
    <View style={[styles.badge, { backgroundColor: colors.danger }]}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected = false, onPress }: ChipProps) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.accentInk : colors.surfaceSunken,
          borderColor: selected ? colors.accentInk : colors.line,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.accentFg : colors.ink2 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
});
