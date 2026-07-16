/**
 * The OS reduce-motion setting, as a live boolean.
 *
 * Split into its own file so ThemeProvider stays declarative and this — the one piece
 * with a subscription lifecycle — is isolated and replaceable. Reduce-motion is an
 * accessibility setting a member turns on because motion makes them unwell; honouring it
 * is not optional polish, so the whole app reads it from here rather than each animation
 * guessing.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Seed from the current value — the listener only fires on CHANGE, so without this a
    // member who already has it enabled would see motion until they toggled it.
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) {
        setReduced(value);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
