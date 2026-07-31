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
export { hasChosenScheme, resolveScheme } from './theme';
export type {
  AccentTokens,
  Colors,
  ColorSchemePref,
  ContrastPair,
  Correction,
  Diagnostics,
  Neutrals,
  ResolvedScheme,
  RGB,
  Scheme,
  ServerSchemeDefault,
  StatusFamily,
  Theme,
} from './theme';
// The React ThemeProvider/useTheme are NOT exported here — they import react-native and
// would pull it into the node jest barrel. The app imports them from
// `@wbcom/mobile-core/theme/ThemeProvider` directly (it is the shell, not a module, so
// the no-deep-import rule that binds modules does not apply to it).

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
// Persistence policy — key by site, bust on version, exclude viewer-state, cap infinite
// lists to page 1. The app composes these into PersistQueryClientProvider.
export {
  capToFirstPage,
  persistBuster,
  persistKey,
  shouldPersistQuery,
} from './cache/persist';

// ── UI decisions (pure) ──────────────────────────────────────────────────────────
//
// The logic behind the UI kit. The COMPONENTS live in ./ui and are imported as
// `@wbcom/mobile-core/ui` (react-native, kept off the node barrel); these are the tested
// decisions they render — the F2 button treatment and the six-state async selection.
export { resolveButtonTreatment } from './ui/buttonStyle';
export type { ButtonTreatment, ButtonVariant } from './ui/buttonStyle';
export { selectAsyncState } from './ui/asyncState';
export type { AsyncInputs, AsyncState } from './ui/asyncState';

// ── Formatting (pure) ──────────────────────────────────────────────────────────────
export { parseTimestamp, relativeTime } from './format/relativeTime';

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
// The boot handshake. Plain axios, outside React Query, never persisted — re-run every
// cold start and resume so a licence expiry is felt, not remembered.
export { bootstrapAppGate, fetchAppConfig } from './gate/bootstrap';
export type { FetchAppConfigOptions } from './gate/bootstrap';
// The resume predicate — which AppState edge re-runs the gate. Pure; the app's
// useAppResume hook feeds it the last significant state.
export { isResumeTransition } from './gate/resume';
export type { AppStateValue } from './gate/resume';

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

// ── Auth (pure) ──────────────────────────────────────────────────────────────────
//
// The handshake LOGIC is node-safe and lives here. The RUNTIME (appSession.ts — it opens
// WebBrowser and touches SecureStore/Crypto) is imported by the app directly from
// `@wbcom/mobile-core/auth/appSession`, never through this barrel, so the native modules
// never enter the node test environment.
export {
  basicAuthHeader,
  buildAuthorizeUrl,
  parseAuthRedirect,
} from './auth/appPassword';
export type {
  AppCredential,
  AuthorizeParams,
  RedirectFailure,
  RedirectResult,
} from './auth/appPassword';
export { buildConnectUrl, parseBridgeRedirect } from './auth/connect';
export type { BridgeRedirectResult, ConnectParams } from './auth/connect';
export { FALLBACK_AUTH_CONFIG, fetchAuthConfig } from './auth/authConfig';
export type { AuthConfig, AuthProvider, FetchAuthConfigOptions } from './auth/authConfig';

// ── Session ──────────────────────────────────────────────────────────────────────
//
// The auth slice of session state (zustand/vanilla — no React). getAuthHeader is the
// synchronous source the client registry reads at request time; the app subscribes to
// `sessionStore` with zustand's useStore hook for the sign-in/out UI.
export { getAuthHeader, isSignedIn, sessionStore } from './session/sessionStore';
export type { SessionState } from './session/sessionStore';

// App-config slice: the site's `/app/config`, captured when the gate opens. `siteGmtOffsetMinutes`
// feeds relativeTime so calendar dates render in the community's timezone, not the device's.
// Module registry (§C2): one descriptor per module; `spineNavItems`/`discoverTiles` are the
// gate-filtered readers both nav surfaces use. The host app owns the concrete table.
export { discoverTiles, integrationStatuses, spineNavItems } from './registry/moduleRegistry';
export type {
  DiscoverTile,
  IntegrationStatus,
  ModuleDescriptor,
  SpineNavItem,
  SpineSpec,
  TileSpec,
} from './registry/moduleRegistry';

// `moduleContext` folds `integrations` into the flat `{features, partnerVersions}` shape the
// nav gate reads — a module descriptor's `flag`/`id` IS the integration key.
export { configStore, moduleContext, siteGmtOffsetMinutes } from './config/configStore';
export type {
  AppBranding,
  AppLegal,
  AppLocale,
  AppTime,
  CapturedConfig,
  ConfigState,
  IntegrationInfo,
  IntegrationsMap,
  RealtimeConfig,
} from './config/configStore';
