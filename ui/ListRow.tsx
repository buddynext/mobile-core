/**
 * ListRow — the one row shape (UX.md §3: 1 row shape).
 *
 * Leading (avatar/icon) + title + optional subtitle + optional trailing (a button, a
 * chevron, a count). Used by members, spaces, notifications, conversations, settings — one
 * vocabulary so every list reads as one product. The whole row is one focus target with a
 * composed label; a trailing INTERACTIVE control is separately focusable by the caller.
 */

import { useColors } from '../theme/ThemeProvider';
import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Show a chevron (navigational row). Ignored when `trailing` is set. */
  chevron?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron,
  onPress,
  accessibilityLabel,
}: ListRowProps) {
  const colors = useColors();

  const composedLabel = accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title);

  const body = (
    <View style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.ink3 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : chevron ? (
        <ChevronRight size={20} color={colors.ink3} />
      ) : null}
    </View>
  );

  if (!onPress) {
    // A static row is still ONE focus target with the composed label (UX.md §3),
    // it just isn't a button.
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={composedLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={composedLabel}
      onPress={onPress}
      style={({ pressed }) => [pressed && { backgroundColor: colors.surfaceSunken }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 60, paddingVertical: 8 },
  leading: {},
  text: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: 2 },
  trailing: { marginStart: 'auto' },
});
