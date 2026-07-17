/**
 * OptionCard — one selectable option in a single-choice group (radio semantics).
 *
 * A tappable card with a title, optional description, and a check when selected. Used where
 * a plain <select> would be in a form (space type, notification preference, privacy audience)
 * — richer than a Chip because each choice needs a sentence of explanation, not just a word.
 */

import { useColors } from '../theme/ThemeProvider';
import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface OptionCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading glyph (e.g. a tone dot or icon). */
  leading?: ReactNode;
}

export function OptionCard({ title, description, selected, onPress, leading }: OptionCardProps) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? colors.surfaceSunken : colors.surface,
          borderColor: selected ? colors.accentInk : colors.line,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        {description ? <Text style={[styles.desc, { color: colors.ink3 }]}>{description}</Text> : null}
      </View>
      <View style={[styles.check, { borderColor: selected ? colors.accentInk : colors.line }]}>
        {selected ? <Check size={14} color={colors.accentInk} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  leading: { width: 24, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { fontSize: 13, lineHeight: 18 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
