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

// ── Cache ────────────────────────────────────────────────────────────────────────
//
// Modules DO use these: a module owns its own mutations, and `registerEntityScope` is
// how it tells core where its entities live without core having to know its key layout.
//
// `patchInData` is exported for tests and for a module with a cache shape core has not
// met; `resetEntityScopes` is a test seam. Neither is a normal call site.
export {
  patchEntityEverywhere,
  patchInData,
} from './cache/optimisticCache';
export type { Rollback } from './cache/optimisticCache';
export {
  isRef,
  registerEntityScope,
  resetEntityScopes,
  scopeFor,
  tag,
} from './cache/entities';
export type { EntityRef, EntityType, KeyScope, Tagged } from './cache/entities';

// ── Gate ─────────────────────────────────────────────────────────────────────────
//
// The host calls both gates: the app gate once at boot/resume, the module gate per
// module before mounting. Modules do not gate themselves — being unmounted is decided
// for them. `meetsMinimum` is exported because it is the shared fail-open version rule
// and a module's own compat check should use it rather than reinvent the direction.
export { evaluateAppGate } from './gate/appGate';
export type {
  AppConfig,
  AppConfigFetch,
  AppGateParams,
  AppGateReason,
  AppGateStatus,
} from './gate/appGate';
export { evaluateModuleGate } from './gate/moduleGate';
export type {
  ModuleGateContext,
  ModuleGateInput,
  ModuleGateStatus,
  ModuleTier,
} from './gate/moduleGate';
export { meetsMinimum } from './gate/semver';

// ── API ──────────────────────────────────────────────────────────────────────────
//
// A module gets its clients through the registry the host builds — it never news up its
// own axios, so there is one credential source and one place a site switch tears down.
// `keysFor(moduleId)` is how a module namespaces every query key without restating its
// id. The site-key helpers are exported for the auth + persister layers (0.10, 0.18).
export { createClientRegistry } from './api/clients';
export type {
  AuthHeaderSource,
  ClientRegistry,
  ClientRegistryOptions,
} from './api/clients';
export { keysFor, moduleKey } from './api/queryKeys';
export type { KeySegment } from './api/queryKeys';
export {
  credentialKey,
  normalizeSiteUrl,
  queryCacheKey,
  siteKey,
} from './api/siteKey';
