/**
 * FormField — one labeled text input, themed and error-aware.
 *
 * Core-owned so every form (profile editor, space create, compose settings) shares the
 * same label / input / error grammar. Handles the common single-line and multiline cases;
 * `keyboard` + `autoCapitalize` are passed through for url/email/number variants. An error
 * string turns the border danger and shows the message below — this is how a 422 field error
 * from the server maps to inline UI.
 */

import { useColors } from '../theme/ThemeProvider';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';

export interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Hint shown under the label (field description). */
  hint?: string;
  /** Server/validation error — reddens the border and shows below. */
  error?: string;
  required?: boolean;
  multiline?: boolean;
  keyboard?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Character budget shown as a counter, and enforced on input. */
  maxLength?: number;
  editable?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  required = false,
  multiline = false,
  keyboard,
  autoCapitalize = 'sentences',
  maxLength,
  editable = true,
}: FormFieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.accent : colors.line;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.ink2 }]}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
        {maxLength ? (
          <Text style={[styles.counter, { color: value.length > maxLength ? colors.danger : colors.ink3 }]}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
      {hint ? <Text style={[styles.hint, { color: colors.ink3 }]}>{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        multiline={multiline}
        keyboardType={keyboard}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize !== 'none'}
        maxLength={maxLength}
        editable={editable}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            color: editable ? colors.ink : colors.ink3,
            backgroundColor: colors.surface,
            borderColor,
          },
        ]}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 13, fontWeight: '600' },
  counter: { fontSize: 12 },
  hint: { fontSize: 12, marginTop: -2 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  inputMultiline: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  error: { fontSize: 12, marginTop: -2 },
});
