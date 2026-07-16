/**
 * The theme's public surface.
 *
 * Everything the app imports for colour comes from here. `primitives` is maths and
 * `derive` is policy; neither should be reached for directly from a component.
 */

export { buildTheme } from './semantic';
export type { Colors, Diagnostics, Neutrals, Scheme, StatusFamily, Theme } from './semantic';
// Pure scheme resolution — safe for the node test barrel. The React ThemeProvider that
// consumes it lives in ./ThemeProvider.tsx and is imported directly by the app, never
// through this barrel, so react-native never enters the node jest environment.
export { hasChosenScheme, resolveScheme } from './scheme';
export type { ColorSchemePref, ResolvedScheme, ServerSchemeDefault } from './scheme';
export { AA_TEXT, AA_UI, DEFAULT_ACCENT } from './derive';
export type { AccentTokens, Correction } from './derive';
export { contrastRatio, parseHex, relativeLuminance, toHex } from './primitives';
export type { RGB } from './primitives';

import type { Colors } from './semantic';

export interface ContrastPair {
  /** Names the pair in a failure message: "ink3 on surfaceSunken". */
  name: string;
  fg: string;
  bg: string;
  /** `text` is held to 4.5:1, `ui` to 3:1. */
  kind: 'text' | 'ui';
}

/**
 * Every foreground/background combination the theme PROMISES is readable.
 *
 * This list is the contract the hostile-accent corpus enforces. It exists as data
 * rather than as assertions inside the test for one reason: a token is only safe on
 * the surfaces someone thought to check. Declaring the pairs here, next to the theme,
 * makes "where can this token render?" a design decision with an answer, instead of
 * something rediscovered when a member reports an invisible button.
 *
 * If you add a token, add its pairs. A token with no pair is untested by construction.
 *
 * DELIBERATE OMISSIONS, so the gaps are decisions and not oversights:
 *
 *   `line` — hairline dividers. WCAG 1.4.11 covers components you must perceive to
 *   operate; a decorative rule between two rows is not one, and holding it to 3:1
 *   would turn every card border into a hard grey slab. `lineStrong` is the token for
 *   boundaries that carry meaning (inputs, outlined controls) and IS held to 3:1.
 *
 *   `accent` on any background — deliberately not a pair. A fill that fails 3:1 is
 *   reported through `accentMeetsAA`, which makes Button render outlined. Asserting it
 *   here would demand we repaint the owner's brand to satisfy a test.
 */
export function contrastPairs(colors: Colors): ContrastPair[] {
  const surfaces = [
    ['bg', colors.bg],
    ['surface', colors.surface],
    ['surfaceSunken', colors.surfaceSunken],
  ] as const;

  const pairs: ContrastPair[] = [];

  const on = (fgName: string, fg: string, kind: 'text' | 'ui') => {
    for (const [bgName, bg] of surfaces) {
      pairs.push({ name: `${fgName} on ${bgName}`, fg, bg, kind });
    }
  };

  // Text must be readable on every surface it can land on. "Muted" is a visual
  // register, not permission to fail AA — ink3 is held to the same 4.5:1 as ink.
  on('ink', colors.ink, 'text');
  on('ink2', colors.ink2, 'text');
  on('ink3', colors.ink3, 'text');
  on('accentInk', colors.accentInk, 'text');

  // Boundaries and the focus ring: 3:1, the non-text threshold.
  on('lineStrong', colors.lineStrong, 'ui');
  on('accentBorder', colors.accentBorder, 'ui');
  on('focusRing', colors.focusRing, 'ui');

  // The label on a filled accent control. Holds whether or not the fill itself passes
  // — accentMeetsAA decides the treatment, not whether the text is legible.
  pairs.push({
    name: 'accentFg on accent',
    fg: colors.accentFg,
    bg: colors.accent,
    kind: 'text',
  });

  // Status colours, both as ink on a plain surface and inside their own tinted banner.
  const statuses = [
    ['success', colors.success, colors.successBg],
    ['danger', colors.danger, colors.dangerBg],
    ['warning', colors.warning, colors.warningBg],
    ['info', colors.info, colors.infoBg],
  ] as const;

  for (const [name, fg, tint] of statuses) {
    on(name, fg, 'text');
    pairs.push({ name: `${name} on ${name}Bg`, fg, bg: tint, kind: 'text' });
    pairs.push({ name: `ink on ${name}Bg`, fg: colors.ink, bg: tint, kind: 'text' });
  }

  return pairs;
}
