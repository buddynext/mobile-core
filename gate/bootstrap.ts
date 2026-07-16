/**
 * Fetch the app-config and decide the app gate — the boot handshake.
 *
 * ARCHITECTURE.md: "Never persist app-config, and never route it through React Query. A
 * disk-restored `app_enabled: true` is a licensing hole. Fetch with plain axios, outside
 * React Query. Cache the credential, never the permission. Re-decide the gate on cold
 * start and on resume."
 *
 * So this is deliberately NOT a React Query hook and NOT memoised. It is a plain async
 * call that runs every cold start and every resume, against the live server, and hands
 * its result straight to the gate. The permission to run the app is re-earned each time;
 * nothing about `app_enabled` is ever written to disk, because a value on disk is a value
 * that outlives an expired licence.
 *
 * It also does NOT go through the client registry. app/config is public and PRE-auth —
 * the app has to read it before it knows whether it may even connect — so it carries no
 * Authorization and shares nothing with the authenticated clients.
 */

import axios, { type AxiosInstance } from 'axios';

import {
  evaluateAppGate,
  type AppConfigFetch,
  type AppGateParams,
  type AppGateStatus,
} from './appGate';
import { normalizeSiteUrl } from '../api/siteKey';

/** Free's public bootstrap route. */
const APP_CONFIG_PATH = '/wp-json/buddynext/v1/app/config';

/** Boot should feel fast or fail fast — a stalled handshake is a stuck splash screen. */
const BOOTSTRAP_TIMEOUT_MS = 12_000;

/**
 * The threshold above which an HTTP status is "the server is having a problem, retrying
 * makes sense" (unreachable) rather than "the server gave a definitive answer about what
 * lives here" (reachable, let the gate judge the body).
 *
 * 404 is the boundary case and is deliberately on the REACHABLE side: a 404 on this path
 * means the site responded but has no BuddyNext plugin active, which the gate correctly
 * reads as not-buddynext. Treating that as unreachable would tell a member to "check your
 * connection" when the real problem is they typed a WordPress site that is not running
 * BuddyNext.
 */
const SERVER_ERROR_FLOOR = 500;

export interface FetchAppConfigOptions {
  /** Injectable for tests; defaults to a fresh, uncached axios instance. */
  client?: AxiosInstance;
  timeoutMs?: number;
}

/**
 * GET the app-config and classify the outcome for the gate.
 *
 * Never throws — the gate consumes a discriminated result, not an exception. A thrown
 * transport error (offline, DNS, TLS, timeout) and a 5xx both become `{ reachable: false }`;
 * any 2xx-4xx response becomes `{ reachable: true, body }` for the gate to parse.
 */
export async function fetchAppConfig(
  siteUrl: string,
  { client, timeoutMs = BOOTSTRAP_TIMEOUT_MS }: FetchAppConfigOptions = {}
): Promise<AppConfigFetch> {
  const url = `${normalizeSiteUrl(siteUrl)}${APP_CONFIG_PATH}`;

  const http =
    client ??
    axios.create({
      timeout: timeoutMs,
      headers: { Accept: 'application/json' },
      // Do not throw on any status; a 4xx is a real answer we want to hand to the gate,
      // not an exception to catch.
      validateStatus: () => true,
    });

  try {
    const response = await http.get(url);

    if (response.status >= SERVER_ERROR_FLOOR) {
      // The server errored. Transient — a resume or retry may succeed, so do not brand
      // the site not-BuddyNext over a 502.
      return { reachable: false };
    }

    return { reachable: true, body: response.data };
  } catch {
    // No response at all: offline, DNS failure, TLS error, or the timeout fired.
    return { reachable: false };
  }
}

/**
 * The full boot decision: fetch, then gate. This is what a cold start and a resume both
 * call. The result is used to render either the app or the takeover screen — and then
 * DISCARDED, never stored.
 */
export async function bootstrapAppGate(
  siteUrl: string,
  params: AppGateParams,
  options?: FetchAppConfigOptions
): Promise<AppGateStatus> {
  const fetched = await fetchAppConfig(siteUrl, options);
  return evaluateAppGate(fetched, params);
}
