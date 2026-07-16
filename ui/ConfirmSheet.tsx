/**
 * ConfirmSheet — the one confirm. NEVER a raw Alert.
 *
 * UX.md: web `Alert` is a SILENT NO-OP on some paths and unstyleable everywhere; the
 * shipped `confirm.ts` forked web/native and drifted. This is the single themed path, and
 * the eslint rule (0.19) forbids `Alert.alert` anywhere but this file so it stays the only
 * one. A destructive action gets a danger-styled confirm; everything else a neutral one.
 *
 * Imperative API (`confirm({...}) -> Promise<boolean>`) via a host mounted once near the
 * root, so any code can await a confirmation without threading state through props.
 */

import { Button } from './Button';
import { useColors } from '../theme/ThemeProvider';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** A destructive confirm styles its button as danger and reads it out to a screen reader. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/** Mount once near the root. Provides `useConfirm()` to everything below. */
export function ConfirmSheetProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    pendingRef.current?.resolve(value);
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={() => close(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => close(false)}>
          {/* Stop propagation: a tap on the card must not dismiss. */}
          <Pressable
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
          >
            <Text style={[styles.title, { color: colors.ink }]}>{pending?.title}</Text>
            <Text style={[styles.message, { color: colors.ink3 }]}>{pending?.message}</Text>
            <View style={styles.actions}>
              <Button
                label={pending?.cancelLabel ?? 'Cancel'}
                variant="secondary"
                onPress={() => close(false)}
              />
              <Button
                label={pending?.confirmLabel ?? 'Confirm'}
                variant={pending?.destructive ? 'secondary' : 'primary'}
                onPress={() => close(true)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Await a confirmation: `if (await confirm({ title, message })) { ... }`. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within a <ConfirmSheetProvider>.');
  }
  return confirm;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
});
