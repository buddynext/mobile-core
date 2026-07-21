/**
 * App-config state — the site's public `/app/config`, captured once the gate opens.
 *
 * ARCHITECTURE.md "State & data": React Query holds server data; zustand holds session/device
 * state. This is the config slice — the small, boot-stable, per-site facts the shell needs
 * synchronously while rendering (today: the timezone for date formatting; tomorrow: the
 * feature flags that drive the nav gate). `bootstrapAppGate` fetches `/app/config` on cold
 * start/resume; `index.tsx` hands the result here so any screen can read it without re-fetching.
 *
 * Built on `zustand/vanilla` (no React) like `sessionStore`, so it stays node-testable and the
 * offset reader below is callable from a pure formatter path. Config is set before the first
 * screen mounts, so a synchronous `getState()` read at render time is correct — there is no
 * "before it loads" window inside the shell.
 */

import { createStore } from 'zustand/vanilla';

/** The `/app/config` `time` block: the owner's WP timezone + the server's current UTC. */
export interface AppTime {
  /** WP `timezone_string`, e.g. "Asia/Kolkata". Empty when the site uses a bare gmt_offset. */
  site_timezone: string;
  /** WP `gmt_offset` in HOURS (e.g. 5.5). The uniform display offset for calendar dates. */
  gmt_offset: number;
  /** Server "now" as UTC ISO-8601 — lets the app anchor relative time to the server clock. */
  server_utc: string;
}

export interface ConfigState {
  /** The site's time block, or null before the gate has resolved. */
  time: AppTime | null;
  /** Capture the resolved app-config (called once when the gate opens). */
  setConfig: (config: { time?: AppTime | null } | null) => void;
  /** Full reset (e.g. switching sites). */
  reset: () => void;
}

export const configStore = createStore<ConfigState>((set) => ({
  time: null,
  setConfig: (config) => set({ time: config?.time ?? null }),
  reset: () => set({ time: null }),
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
