/**
 * Accent derivation — the site owner's brand colour turned into usable tokens.
 *
 * The rule, and the reason this file exists at all:
 *
 *   `accent` is the owner's brand. We never repaint it.
 *   Everything DERIVED from it is ours to correct, hue preserved, and reported.
 *
 * The four shipped apps all took `accent` and painted it wherever accent was wanted —
 * as a fill, as text, as an icon, in both schemes, unmeasured. That produced three
 * distinct shipped bugs (F2/F3/F4 in UX.md) which are really one mistake: treating a
 * brand token as a palette.
 */

import {
  adjustLightness,
  minContrast,
  parseHex,
  readableForeground,
  toHex,
  type RGB,
} from './primitives';

/** WCAG AA for body text and icons that carry meaning. */
export const AA_TEXT = 4.5;
/** WCAG AA for UI boundaries, focus rings, and large text. */
export const AA_UI = 3.0;

/**
 * BuddyNext violet. Also what Free's `Theme/Appearance.php` treats as "unset".
 */
export const DEFAULT_ACCENT = '#7C3AED';

export interface Correction {
  /** The token that had to move. Never `accent`. */
  token: string;
  /** What the owner's accent would have produced. */
  requested: string;
  /** What actually ships. */
  shipped: string;
  /** Human-readable why, for Settings > About > Theme diagnostics. */
  reason: string;
}

export interface AccentTokens {
  /** The owner's brand, untouched. Fills, and nothing else. */
  accent: string;
  /** Pure black or white — whichever is readable ON the accent. Labels of filled controls. */
  accentFg: string;
  /** The accent as text/icon on a background. Lightness-corrected, hue kept. */
  accentInk: string;
  /** The accent as a 3:1 boundary. Outlines, focus rings, dividers that carry meaning. */
  accentBorder: string;
  /**
   * Can the accent carry a FILLED treatment on this scheme's surfaces?
   *
   * False means the fill is invisible as a shape (a pale yellow button on white), NOT
   * that its label is unreadable — `accentFg` guarantees the label always works. The
   * answer to a failing fill is an OUTLINED control, which is why this is a token the
   * Button reads and not an error.
   */
  accentMeetsAA: boolean;
}

export interface AccentDerivation {
  tokens: AccentTokens;
  corrections: Correction[];
  usedFallback: boolean;
}

/**
 * Derive the accent tokens for one scheme.
 *
 * `backgrounds` must list EVERY surface these tokens can land on — page, card, sunken.
 * Deriving against one background ships a token that fails on the others: in dark,
 * `surface` is lighter than `bg`; in light, `surfaceSunken` is darker. Both directions
 * have bitten us.
 */
export function deriveAccent(input: string, backgrounds: RGB[]): AccentDerivation {
  const parsed = parseHex(input);
  const usedFallback = parsed === null;
  const accent = parsed ?? parseHex(DEFAULT_ACCENT)!;

  const corrections: Correction[] = [];

  /**
   * Move a derived token to `target` only if it does not already clear it. The guard
   * matters: without it, a perfectly good accent gets snapped to the nearest scan step
   * and the owner's brand is quietly nudged for no reason.
   */
  const derive = (token: string, target: number, reason: string): string => {
    if (minContrast(accent, backgrounds) >= target) {
      return toHex(accent);
    }

    const corrected = adjustLightness(accent, backgrounds, target);
    if (!corrected) {
      // Unreachable for the surfaces we ship, but a null here would mean shipping an
      // unreadable token. Fall back to a guaranteed-readable neutral and say so.
      const fallback = readableForeground(backgrounds[0]!);
      corrections.push({
        token,
        requested: toHex(accent),
        shipped: toHex(fallback),
        reason: `${reason} No lightness of this hue could reach ${target}:1; fell back to a neutral.`,
      });
      return toHex(fallback);
    }

    corrections.push({
      token,
      requested: toHex(accent),
      shipped: toHex(corrected),
      reason,
    });
    return toHex(corrected);
  };

  const accentInk = derive(
    'accentInk',
    AA_TEXT,
    'The accent is not readable as text on this scheme\'s surfaces. Lightness rotated, hue preserved.'
  );

  const accentBorder = derive(
    'accentBorder',
    AA_UI,
    'The accent is not distinguishable as a boundary on this scheme\'s surfaces. Lightness rotated, hue preserved.'
  );

  return {
    tokens: {
      accent: toHex(accent),
      // Measured against the ACCENT, not the background — this is the label sitting on
      // top of the fill.
      accentFg: toHex(readableForeground(accent)),
      accentInk,
      accentBorder,
      accentMeetsAA: minContrast(accent, backgrounds) >= AA_UI,
    },
    corrections,
    usedFallback,
  };
}
