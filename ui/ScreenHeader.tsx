/**
 * ScreenHeader — the one screen title bar.
 *
 * A large title (feed/list roots) or a compact back-header (detail screens). Core-owned so
 * a module never draws its own header or back button (UX.md §grammar). The back button is
 * a real 44pt target with a label for screen readers.
 */

import { useColors } from '../theme/ThemeProvider';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ScreenHeaderProps {
  title: string;
  /** Show a back chevron and call this on press. Omit for a root screen. */
  onBack?: () => void;
  /** Large title (roots) vs compact centred title (detail). */
  large?: boolean;
  /** Trailing action(s), e.g. a compose or settings button. */
  right?: ReactNode;
}

export function ScreenHeader({ title, onBack, large = false, right }: ScreenHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: colors.bg, borderBottomColor: large ? 'transparent' : colors.line }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={onBack} style={styles.back}>
            <ChevronLeft size={26} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        {!large ? (
          <Text style={[styles.compactTitle, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={styles.rightSlot}>{right}</View>
      </View>
      {large ? (
        <Text style={[styles.largeTitle, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  compactTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  largeTitle: { fontSize: 30, fontWeight: '800', paddingHorizontal: 16, paddingBottom: 8 },
  rightSlot: { minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
});
