/**
 * ActionSheet — a bottom sheet of choices. The native idiom for an overflow menu (a member
 * kebab, a post's "..."): a list of actions, a destructive one tinted danger, and Cancel.
 *
 * Prop-driven (visible + actions + onClose) rather than imperative, because a kebab already
 * owns its open state locally. Tapping an action closes the sheet, then runs it.
 */

import { useColors } from '../theme/ThemeProvider';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: SheetAction[];
  cancelLabel?: string;
}

export function ActionSheet({ visible, onClose, title, message, actions, cancelLabel = 'Cancel' }: ActionSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const run = (action: SheetAction) => {
    if (action.disabled) return;
    onClose();
    // Defer so the sheet's dismiss animation isn't interrupted by a navigation the action triggers.
    setTimeout(action.onPress, 0);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          {title ? <Text style={[styles.title, { color: colors.ink }]}>{title}</Text> : null}
          {message ? <Text style={[styles.message, { color: colors.ink3 }]}>{message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((action, i) => (
              <Pressable
                key={`${action.label}-${i}`}
                accessibilityRole="button"
                disabled={action.disabled}
                onPress={() => run(action)}
                style={({ pressed }) => [
                  styles.action,
                  { borderTopColor: colors.line },
                  i === 0 && !title && !message && styles.firstAction,
                  pressed && { backgroundColor: colors.surfaceSunken },
                  action.disabled && { opacity: 0.4 },
                ]}
              >
                <Text
                  style={[
                    styles.actionText,
                    { color: action.destructive ? colors.danger : colors.ink },
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: colors.surfaceSunken },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.cancelText, { color: colors.ink }]}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopStartRadius: 20, borderTopEndRadius: 20, paddingHorizontal: 8, paddingTop: 8 },
  title: { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingHorizontal: 16, paddingTop: 8 },
  message: { fontSize: 13, textAlign: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  actions: { marginTop: 8 },
  action: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  firstAction: { borderTopWidth: 0 },
  actionText: { fontSize: 17, fontWeight: '500' },
  cancel: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginHorizontal: 8 },
  cancelText: { fontSize: 17, fontWeight: '700' },
});
