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
}

export function Button({
  label,
  variant = 'primary',
  busy = false,
  block = false,
  disabled,
  ...pressable
}: ButtonProps) {
  const colors = useColors();
  const treatment = resolveButtonTreatment(variant, colors);
  const inert = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy }}
      disabled={inert}
      style={({ pressed }) => [
        styles.base,
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
        <ActivityIndicator color={treatment.color} />
      ) : (
        <Text style={[styles.label, { color: treatment.color }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48, // HIG 44 / Android 48 -> take the stricter (UX.md §11).
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  block: { alignSelf: 'stretch' },
  inert: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontSize: 16, fontWeight: '600' },
});
