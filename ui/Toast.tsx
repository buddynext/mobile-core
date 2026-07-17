/**
 * Toast — a transient confirmation line. NOT a dialog: it acknowledges a completed action
 * (reported, muted, link copied) and dismisses itself, so the flow keeps moving.
 *
 * Imperative API (`toast('Reported')`) via a host mounted once near the root, matching the
 * ConfirmSheet pattern — any code can acknowledge without threading state through props.
 * A single toast at a time; a new one replaces the current.
 */

import { useColors } from '../theme/ThemeProvider';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastFn = (message: string) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** Mount once near the root. Provides `useToast()` to everything below. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback<ToastFn>((next) => {
    setMessage(next);
  }, []);

  useEffect(() => {
    if (message === null) {
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMessage(null);
      });
    }, 2400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, opacity]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message !== null ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            { backgroundColor: colors.ink, bottom: insets.bottom + 32, opacity },
          ]}
        >
          <Text style={[styles.text, { color: colors.bg }]} numberOfLines={2}>
            {message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const toast = useContext(ToastContext);
  if (!toast) {
    throw new Error('useToast must be used within a <ToastProvider>.');
  }
  return toast;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  text: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
