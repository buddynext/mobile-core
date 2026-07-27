/**
 * App-config state — the site's public `/app/config`, captured once the gate opens.
 *
 * ARCHITECTURE.md "State & data": React Query holds server data; zustand holds session/device
 * state. This is the config slice — the small, boot-stable, per-site facts the shell needs
 * synchronously while rendering: the timezone for date formatting, the feature flags + the
 * installed-integrations map that drive the nav gate, and the realtime (websocket) params.
 * `bootstrapAppGate` fetches `/app/config` on cold start/resume; `index.tsx` hands the result
 * here so any screen can read it without re-fetching.
 *
 * Built on `zustand/vanilla` (no React) like `sessionStore`, so it stays node-testable and the
 * readers below are callable from a pure formatter/gate path. Config is set before the first
 * screen mounts, so a synchronous `getState()` read at render time is correct.
 */

import { createStore } from 'zustand/vanilla';

import type { ModuleGateContext } from '../gate/moduleGate';

/** The `/app/config` `time` block: the owner's WP timezone + the server's current UTC. */
export interface AppTime {
  /** WP `timezone_string`, e.g. "Asia/Kolkata". Empty when the site uses a bare gmt_offset. */
  site_timezone: string;
  /** WP `gmt_offset` in HOURS (e.g. 5.5). The uniform display offset for calendar dates. */
  gmt_offset: number;
  /** Server "now" as UTC ISO-8601 — lets the app anchor relative time to the server clock. */
  server_utc: string;
}

/** One `/app/config` `integrations` entry: is the partner active, and at what version. */
export interface IntegrationInfo {
  enabled: boolean;
  /** Installed partner plugin version, or null when the plugin is absent. */
  version: string | null;
}

/** The `/app/config` `integrations` map, keyed by partner key (media, jetonomy, careerboard, …). */
export type IntegrationsMap = Record<string, IntegrationInfo>;

/** The `/app/config` `realtime` block — websocket (Soketi/Pusher) params for live transport. */
export interface RealtimeConfig {
  available: boolean;
  host: string;
  app_key: string;
  cluster: string;
  auth_url: string;
}

/** The `/app/config` `branding` block — the owner's look. Empty strings mean "inherit". */
export interface AppBranding {
  app_name: string;
  accent_color: string;
  logo_url: string;
  login_bg_url: string;
  /** Scheme SEED for members who never chose (scheme.ts: seeds, never overrides). */
  color_scheme_default: 'auto' | 'light' | 'dark';
}

/** The `/app/config` `legal` block. Empty string = the site did not set that URL. */
export interface AppLegal {
  privacy_url: string;
  terms_url: string;
  eula_url: string;
  guidelines_url: string;
  abuse_contact: string;
}

/**
 * The `/app/config` `locale` block — the site's language facts, used to seed the app's
 * language resolution and the Settings language picker, and to cache-bust OTA strings.
 */
export interface AppLocale {
  /** Site default locale as a short app code, e.g. "en" or "es". */
  default: string;
  /** Short codes the site actually ships translations for, e.g. ["en","es","fr"]. */
  languages: string[];
  /** Bumps whenever the site's translations change → the app refetches its OTA strings. */
  strings_version: number;
}

/** The subset of `/app/config` the shell captures for synchronous reads. */
export interface CapturedConfig {
  time?: AppTime | null;
  features?: Record<string, boolean> | null;
  integrations?: IntegrationsMap | null;
  realtime?: RealtimeConfig | null;
  branding?: AppBranding | null;
  legal?: AppLegal | null;
  locale?: AppLocale | null;
}

export interface ConfigState {
  /** The site's time block, or null before the gate has resolved. */
  time: AppTime | null;
  /** app-config `features`: { key: boolean }. Empty until the gate resolves. */
  features: Record<string, boolean>;
  /** app-config `integrations`: { key: {enabled, version} }. Empty until the gate resolves. */
  integrations: IntegrationsMap;
  /** app-config `realtime` websocket params, or null when absent/unresolved. */
  realtime: RealtimeConfig | null;
  /** app-config `branding`, or null before the gate resolves (theme falls back to defaults). */
  branding: AppBranding | null;
  /** app-config `legal` URLs, or null when unresolved. Settings renders only set URLs. */
  legal: AppLegal | null;
  /** app-config `locale` (default + shipped languages + strings version), or null when unresolved. */
  locale: AppLocale | null;
  /** Capture the resolved app-config (called once when the gate opens). */
  setConfig: (config: CapturedConfig | null) => void;
  /** Full reset (e.g. switching sites). */
  reset: () => void;
}

const EMPTY = {
  time: null,
  features: {},
  integrations: {},
  realtime: null,
  branding: null,
  legal: null,
  locale: null,
} as const;

export const configStore = createStore<ConfigState>((set) => ({
  ...EMPTY,
  setConfig: (config) =>
    set({
      time: config?.time ?? null,
      features: config?.features ?? {},
      integrations: config?.integrations ?? {},
      realtime: config?.realtime ?? null,
      branding: config?.branding ?? null,
      legal: config?.legal ?? null,
      locale: config?.locale ?? null,
    }),
  reset: () => set({ ...EMPTY }),
}));

/**
 * The site's UTC offset in MINUTES, for rendering calendar dates in the community's timezone
 * (the owner's WP setting) rather than the device's or raw UTC. Returns 0 (UTC) when config
 * has not resolved or the site sits at UTC — which is exactly the pre-existing behaviour.
 */
export function siteGmtOffsetMinutes(): number {
  const { time } = configStore.getState();
  return time ? Math.round(time.gmt_offset * 60) : 0;
}

/**
 * Synthesize the {@link ModuleGateContext} the nav gate reads, from the captured config.
 *
 * `evaluateModuleGate` checks `features[flag]` (enabled?) and `partnerVersions[id]` (new
 * enough?). The site reports module enablement + version under `integrations`, a DIFFERENT
 * shape — so we fold each integration into the flat `features` map (key -> enabled) and into
 * `partnerVersions` (key -> version). A module descriptor therefore uses the integration KEY
 * as both its `flag` and its `id`. Core FeatureRegistry flags stay under their own keys.
 *
 * When `integrations` is absent (old plugin / old contract), integration modules simply have
 * no flag and stay silently off — the correct graceful degradation.
 */
export function moduleContext(): ModuleGateContext {
  const { features, integrations } = configStore.getState();
  const merged: Record<string, boolean> = { ...features };
  const partnerVersions: Record<string, string> = {};
  for (const [key, info] of Object.entries(integrations)) {
    merged[key] = info.enabled;
    if (info.version != null && info.version !== '') {
      partnerVersions[key] = info.version;
    }
  }
  return { features: merged, partnerVersions };
}
