/**
 * Button treatment resolution — the F2 fix, as a pure function.
 *
 * F2 in the shipped apps: `accentMeetsAA` was computed, exported, documented, and then
 * never read. Button always filled with the accent, so a pale-yellow brand shipped a
 * filled button with an unreadable-as-a-shape fill. The fix is not more colour maths —
 * the theme already tells us whether the accent can carry a fill — it is WIRING that
 * answer into the one place that draws a button.
 *
 * So this reads `colors.accentMeetsAA` and picks filled vs outlined. Pure and node-tested
 * because the F2 regression is exactly "the component stopped reading the flag", and a
 * unit test on this function catches that where a screenshot might not.
 */

import type { Colors } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonTreatment {
  backgroundColor: string;
  /** Text/icon colour. Always AA against backgroundColor by construction. */
  color: string;
  borderColor: string;
  borderWidth: number;
}

const OUTLINE_WIDTH = 1.5;

/**
 * Resolve the visual treatment for a button variant against a theme.
 *
 * primary — FILLED with the brand accent when the accent can carry a fill
 * (`accentMeetsAA`), so the owner's colour is the button. When it cannot, the button
 * renders OUTLINED with `accentInk` text on `accentBorder` — the non-destructive answer
 * that keeps the brand hue and stays readable, instead of a filled shape nobody can see.
 *
 * secondary — always a neutral outline; it is not competing for attention.
 *
 * ghost — text only, in `accentInk` (readable accent-as-ink, never raw accent — that is
 * the F3 invisible-retry-button bug).
 */
export function resolveButtonTreatment(
  variant: ButtonVariant,
  colors: Colors
): ButtonTreatment {
  switch (variant) {
    case 'primary':
      return colors.accentMeetsAA
        ? {
            backgroundColor: colors.accent,
            color: colors.accentFg,
            borderColor: colors.accent,
            borderWidth: 0,
          }
        : {
            backgroundColor: 'transparent',
            color: colors.accentInk,
            borderColor: colors.accentBorder,
            borderWidth: OUTLINE_WIDTH,
          };

    case 'secondary':
      return {
        backgroundColor: 'transparent',
        color: colors.ink,
        borderColor: colors.lineStrong,
        borderWidth: OUTLINE_WIDTH,
      };

    case 'ghost':
      return {
        backgroundColor: 'transparent',
        color: colors.accentInk,
        borderColor: 'transparent',
        borderWidth: 0,
      };
  }
}
