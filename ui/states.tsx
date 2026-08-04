/**
 * The async states — the visual side of selectAsyncState.
 *
 * Every async surface renders exactly one of these. Skeleton is shaped like real content
 * (never a centred spinner — UX.md §9). Error and Offline are DIFFERENT: offline has its
 * own copy and no retry (it recovers on reconnect), because a "Try again" button that
 * cannot work while the radio is off is the shipped bug this split exists to kill.
 */

import { Button } from './Button';
import { useUiStrings } from './uiStrings';
import { useColors } from '../theme/ThemeProvider';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function Skeleton({ height = 72, count = 6 }: { height?: number; count?: number }) {
  const colors = useColors();
  const strings = useUiStrings();
  return (
    <View style={styles.pad} accessibilityLabel={strings.loading} accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[styles.skelRow, { height, backgroundColor: colors.surfaceSunken }]}
        />
      ))}
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  message: string;
  /** REQUIRED by AsyncBoundary's type — an empty screen must answer "what next?". */
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  const colors = useColors();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.ink3 }]}>{message}</Text>
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} variant="primary" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  const strings = useUiStrings();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: colors.ink }]}>{strings.somethingWrong}</Text>
      <Text style={[styles.body, { color: colors.ink3 }]}>{strings.couldNotLoad}</Text>
      <View style={styles.action}>
        {/* Retry text is the button's accentInk by construction — never invisible (F3). */}
        <Button label={strings.retry} variant="primary" onPress={onRetry} />
      </View>
    </View>
  );
}

export function OfflineState() {
  const colors = useColors();
  const strings = useUiStrings();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: colors.ink }]}>{strings.offlineTitle}</Text>
      <Text style={[styles.body, { color: colors.ink3 }]}>{strings.offlineMessage}</Text>
      {/* No retry — reconnecting recovers it. */}
    </View>
  );
}

/** The bar shown above cached content while offline (the 'stale' state). */
export function OfflineBar() {
  const colors = useColors();
  const strings = useUiStrings();
  return (
    <View style={[styles.bar, { backgroundColor: colors.warningBg }]}>
      <Text style={[styles.barText, { color: colors.warning }]}>{strings.offlineBar}</Text>
    </View>
  );
}

export function InlineSpinner() {
  const colors = useColors();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accentInk} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 12 },
  skelRow: { borderRadius: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  action: { marginTop: 16 },
  bar: { paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' },
  barText: { fontSize: 13, fontWeight: '600' },
});
