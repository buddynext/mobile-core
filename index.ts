/**
 * `@wbcom/mobile-core` — the shell.
 *
 * THIS FILE IS THE ARCHITECTURE'S ONE HARD RULE, made real.
 *
 * ARCHITECTURE.md: "modules import only `@wbcom/mobile-core`. Module -> module imports
 * are forbidden." That rule is only enforceable if there is exactly one door, and this
 * is it. A module reaching for `@wbcom/mobile-core/theme/primitives` is reaching past
 * the contract, and the lint rule (TG0.19) treats a deep import as the violation it is.
 *
 * So: everything a module may use is re-exported here, and nothing else is. If a symbol
 * is not in this file, modules cannot have it — that is a design decision each time,
 * not an oversight.
 *
 * API UNSTABLE until BuddyNext ships (ARCHITECTURE.md TG8). `private: true`, version
 * `0.0.0`, no publishing. Breaking changes are free until then; TG8 is *stabilise and
 * publish*, not *extract and restructure*.
 */

// ── Theme ────────────────────────────────────────────────────────────────────────
//
// `buildTheme` is exported; the colour maths behind it is not. A module has no reason
// to compute a contrast ratio — it asks for `colors.accentInk` and gets a token that is
// already proven readable. Exporting `adjustLightness` would invite a module to derive
// its own accent, which is exactly the F2/F3/F4 bug class the theme exists to prevent.
export { buildTheme, contrastPairs, AA_TEXT, AA_UI, DEFAULT_ACCENT } from './theme';
export type {
  AccentTokens,
  Colors,
  ContrastPair,
  Correction,
  Diagnostics,
  Neutrals,
  RGB,
  Scheme,
  StatusFamily,
  Theme,
} from './theme';

// ── Registry ─────────────────────────────────────────────────────────────────────
//
// The resolver is exported because the host calls it at five call sites. Modules do not
// call it — they contribute claims and the host resolves them.
export { resolveContributions } from './registry/resolve';
export type {
  PinnedSlots,
  Resolution,
  Resolved,
  ResolveInput,
  ServerNavItem,
} from './registry/resolve';
