/**
 * The semantic palette — the only colour names the rest of the app is allowed to know.
 *
 * No component ever writes a hex. It asks for `colors.ink` or `colors.accentInk`, and
 * this file is where "what does ink mean in dark?" is answered once. That indirection
 * is what makes a scheme switch a one-line change instead of a grep.
 *
 * The neutrals below are fixed, not derived: they are OUR product surface, not the
 * owner's brand. Only the accent family comes from the site. Every value here is
 * pinned by `contrast.test.ts` in both schemes — if you change one and the suite goes
 * red, the new value is unreadable, not the test wrong.
 */

import { deriveAccent, type Correction } from './derive';
import { parseHex, type RGB } from './primitives';

export type Scheme = 'light' | 'dark';

export interface Neutrals {
  /** The page. */
  bg: string;
  /** Cards, sheets, anything raised off the page. */
  surface: string;
  /** Wells, inputs, anything pressed into the page. */
  surfaceSunken: string;
  /** Primary text. */
  ink: string;
  /** Secondary text — timestamps, meta. */
  ink2: string;
  /** Tertiary text. Still AA; "muted" is never an excuse to fail. */
  ink3: string;
  /** Hairline dividers. Decorative — deliberately NOT held to 3:1. */
  line: string;
  /** Borders that carry meaning: inputs, outlined controls. Held to 3:1. */
  lineStrong: string;
}

export interface StatusFamily {
  /** The status as text/icon on bg or surface. */
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
}

export interface Colors extends Neutrals, StatusFamily {
  accent: string;
  accentFg: string;
  accentInk: string;
  accentBorder: string;
  accentMeetsAA: boolean;
  /** Focus indicator. Same value as accentInk — one ring, always visible. */
  focusRing: string;
}

/**
 * `ink3` is #64707F and not the more conventional #6B7280 for a measurable reason:
 * #6B7280 clears 4.5:1 on white (4.83) but only reaches 4.47 on `surfaceSunken`. Muted
 * text inside a well is exactly where it renders. Four hundredths of a ratio point is
 * the whole difference between a token that works and one that fails where it is used.
 */
const LIGHT: Neutrals = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSunken: '#F5F6F8',
  ink: '#111827',
  ink2: '#4B5563',
  ink3: '#64707F',
  line: '#E5E7EB',
  lineStrong: '#848A96',
};

const DARK: Neutrals = {
  bg: '#0B0F19',
  surface: '#131824',
  surfaceSunken: '#070A11',
  ink: '#F3F4F6',
  ink2: '#C3C8D2',
  ink3: '#9BA3B2',
  line: '#262C3A',
  lineStrong: '#6B7280',
};

const LIGHT_STATUS: StatusFamily = {
  success: '#067647',
  successBg: '#ECFDF3',
  danger: '#B42318',
  dangerBg: '#FEF3F2',
  warning: '#B54708',
  warningBg: '#FFFAEB',
  info: '#175CD3',
  infoBg: '#EFF8FF',
};

const DARK_STATUS: StatusFamily = {
  success: '#75E0A7',
  successBg: '#053321',
  danger: '#FDA29B',
  dangerBg: '#55160C',
  warning: '#FEC84B',
  warningBg: '#4E1D09',
  info: '#84CAFF',
  infoBg: '#102A56',
};

const NEUTRALS: Record<Scheme, Neutrals> = { light: LIGHT, dark: DARK };
const STATUS: Record<Scheme, StatusFamily> = { light: LIGHT_STATUS, dark: DARK_STATUS };

export interface Diagnostics {
  /** Exactly what the site sent, before anything was derived. */
  requestedAccent: string;
  /** True when the accent was unusable and the default was substituted. */
  usedFallback: boolean;
  /**
   * Every derived token that had to move, and why.
   *
   * Reported, never silent. Settings > About > Theme diagnostics shows the owner what
   * they asked for next to what shipped — correcting a derived token behind their back
   * and calling it their brand would be the dishonest version of this feature.
   */
  corrections: Correction[];
}

export interface Theme {
  scheme: Scheme;
  colors: Colors;
  diagnostics: Diagnostics;
}

export function buildTheme(accent: string, scheme: Scheme): Theme {
  const neutrals = NEUTRALS[scheme];
  const status = STATUS[scheme];

  // Every surface accent tokens can land on. Missing one ships a token that is
  // readable on the page and invisible on a card.
  const backgrounds: RGB[] = [neutrals.bg, neutrals.surface, neutrals.surfaceSunken].map(
    (hex) => parseHex(hex)!
  );

  const { tokens, corrections, usedFallback } = deriveAccent(accent, backgrounds);

  return {
    scheme,
    colors: {
      ...neutrals,
      ...status,
      ...tokens,
      focusRing: tokens.accentInk,
    },
    diagnostics: {
      requestedAccent: accent,
      usedFallback,
      corrections,
    },
  };
}
