/**
 * Button — the one button. Reads accentMeetsAA through resolveButtonTreatment (F2).
 *
 * The component is intentionally dumb: all the "which colours" logic is the tested pure
 * function, and this only turns that into pixels + a 48pt touch target + a busy state. A
 * module never styles its own button; it picks a variant.
 */

import { resolveButtonTreatment, type ButtonVariant } from './buttonStyle';
import { useColors } from '../theme/ThemeProvider';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  busy?: boolean;
  /** Full-width block button. */
  block?: boolean;
  /**
   * `md` (default) — the 48pt primary CTA. `sm` — a compact pill for inline list actions
   * (Follow, Join, Approve) where a full-height button reads as heavy. `sm` keeps a 44pt
   * effective touch target via hitSlop.
   */
  size?: 'md' | 'sm';
}

export function Button({
  label,
  variant = 'primary',
  busy = false,
  block = false,
  size = 'md',
  disabled,
  ...pressable
}: ButtonProps) {
  const colors = useColors();
  const treatment = resolveButtonTreatment(variant, colors);
  const inert = disabled || busy;
  const small = size === 'sm';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy }}
      disabled={inert}
      hitSlop={small ? 6 : undefined}
      style={({ pressed }) => [
        styles.base,
        small ? styles.small : styles.medium,
        {
          backgroundColor: treatment.backgroundColor,
          borderColor: treatment.borderColor,
          borderWidth: treatment.borderWidth,
        },
        block && styles.block,
        inert && styles.inert,
        pressed && styles.pressed,
      ]}
      {...pressable}
    >
      {busy ? (
        <ActivityIndicator color={treatment.color} size={small ? 'small' : undefined} />
      ) : (
        <Text style={[small ? styles.labelSmall : styles.label, { color: treatment.color }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  medium: {
    minHeight: 48, // HIG 44 / Android 48 -> take the stricter (UX.md §11).
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  small: {
    minHeight: 34,
    paddingHorizontal: 16,
    borderRadius: 17, // pill
  },
  block: { alignSelf: 'stretch' },
  inert: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontSize: 16, fontWeight: '600' },
  labelSmall: { fontSize: 14, fontWeight: '600' },
});
