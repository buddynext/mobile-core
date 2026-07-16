/**
 * ThemeProvider — the React glue over the pure theme.
 *
 * Everything hard already happened elsewhere and is tested: `buildTheme` derives the
 * palette (contrast.test.ts), `resolveScheme` decides light vs dark (scheme.test.ts).
 * This file only wires those to the device: it reads the system scheme, the writing
 * direction, and the reduce-motion setting, and re-renders when any of them changes.
 *
 * Kept deliberately thin. The temptation in the shipped apps was to compute colours in
 * the provider; here the provider computes NOTHING it could get wrong — it calls
 * buildTheme(accent, resolveScheme(...)) and hands the result down. If a colour is wrong,
 * the bug is in the tested pure layer, not in a component nobody tests.
 *
 * NOTE: this is the one `mobile-core` file that imports React + react-native, so the
 * node jest suite never imports it (it would pull the RN runtime into a node env). It is
 * verified on-device, following the same split the app scaffold uses.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useColorScheme,
  useWindowDimensions,
  I18nManager,
  AccessibilityInfo,
} from 'react-native';

import { buildTheme, type Theme } from './index';
import {
  hasChosenScheme,
  resolveScheme,
  type ColorSchemePref,
  type ServerSchemeDefault,
} from './scheme';
import { useReducedMotion } from './useReducedMotion';

export interface ThemeContextValue {
  theme: Theme;
  /** The member's stored preference — null means never chosen. */
  schemePref: ColorSchemePref;
  /** True once the member has made any explicit choice. */
  schemeChosen: boolean;
  /**
   * Whether animation should play. Driven by the OS reduce-motion setting — an
   * accessibility need, honoured app-wide, never a per-screen decision.
   */
  motionEnabled: boolean;
  /** RTL is a device/locale fact, surfaced here so components read it from one place. */
  isRTL: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  /** The site's brand accent from app-config. Empty string ⇒ buildTheme uses its default. */
  accent: string;
  /** app-config `branding.color_scheme_default`. */
  serverDefault: ServerSchemeDefault;
  /** The member's stored preference (from the session store). */
  schemePref: ColorSchemePref;
  children: ReactNode;
}

export function ThemeProvider({
  accent,
  serverDefault,
  schemePref,
  children,
}: ThemeProviderProps) {
  // useColorScheme re-renders on the OS light/dark switch. It can briefly be null during
  // a transition; treat that as light, the safer default surface.
  const systemScheme = useColorScheme() ?? 'light';
  const reducedMotion = useReducedMotion();

  // Subscribe to dimension changes so a rotation/resize re-renders the tree; the value
  // itself is unused here but the subscription keeps derived layout honest.
  useWindowDimensions();

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = resolveScheme(schemePref, serverDefault, systemScheme);
    return {
      theme: buildTheme(accent, scheme),
      schemePref,
      schemeChosen: hasChosenScheme(schemePref),
      motionEnabled: !reducedMotion,
      isRTL: I18nManager.isRTL,
    };
  }, [accent, serverDefault, schemePref, systemScheme, reducedMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Read the theme. Throws if used outside a provider — a component rendering without a
 * theme is a wiring bug that should fail loudly at dev time, not paint with undefined
 * colours.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within a <ThemeProvider>.');
  }
  return value;
}

/** Convenience for the common case — just the colours. */
export function useColors() {
  return useTheme().theme.colors;
}

// Re-exported so a consumer needs only this module for the accessibility helper too.
export { AccessibilityInfo };
