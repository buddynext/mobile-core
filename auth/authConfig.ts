/**
 * Auth-method discovery — what sign-in options does THIS site support?
 *
 * The sign-in screen renders its buttons FROM the server's answer: which social
 * providers are ready, whether the connect-app bridge exists, whether
 * registration is open. The plugin publishes all of it as an `auth` block on the
 * same public `/app/config` the boot gate already reads — one endpoint, additive
 * field, contract_version untouched.
 *
 * Degradation is the load-bearing design: an OLDER plugin has no `auth` key at
 * all, and this resolves to FALLBACK_AUTH_CONFIG with `bridge: false` — the one
 * flag the sign-in screen uses to route the connect button through the legacy
 * `authorize-application.php` flow instead. Absent means degrade, never break.
 *
 * Same rules as gate/bootstrap.ts, and for the same reasons: plain axios (this
 * is pre-auth — no Authorization, no client registry), never memoised, never
 * persisted, never throws.
 */

import axios, { type AxiosInstance } from 'axios';

import { normalizeSiteUrl } from '../api/siteKey';

/** The same public bootstrap route the app gate reads; auth is a block on it. */
const AUTH_CONFIG_PATH = '/wp-json/buddynext/v1/app/config';

/** Matches the gate's boot budget — a slow answer must not stall the sign-in screen. */
const AUTH_CONFIG_TIMEOUT_MS = 12_000;

/** One social provider the site can complete a flow for right now. */
export interface AuthProvider {
  id: string;
  label: string;
}

export interface AuthConfig {
  /** Ready providers, in the server's order. Empty when none are configured. */
  providers: AuthProvider[];
  /** The site's inline two-factor support on POST /auth/login. */
  twofactor: boolean;
  /** Whether registration is open (drives the create-account entry point). */
  register: boolean;
  /** The DISCOVERED bridge entry URL; '' when the site has no bridge. */
  connectUrl: string;
  /**
   * True only when the site published a usable bridge. False routes the
   * sign-in screen through the legacy authorize-application flow.
   */
  bridge: boolean;
}

export const FALLBACK_AUTH_CONFIG: AuthConfig = {
  providers: [],
  twofactor: false,
  register: false,
  connectUrl: '',
  bridge: false,
};

export interface FetchAuthConfigOptions {
  /** Injectable for tests; defaults to a fresh, uncached axios instance. */
  client?: AxiosInstance;
  timeoutMs?: number;
}

/**
 * GET the site's auth capabilities. Never throws; every failure shape — offline,
 * 404 (no plugin), 5xx, malformed body, missing auth block — resolves to the
 * fallback, which the screen reads as "legacy flow, no provider buttons".
 */
export async function fetchAuthConfig(
  siteUrl: string,
  { client, timeoutMs = AUTH_CONFIG_TIMEOUT_MS }: FetchAuthConfigOptions = {}
): Promise<AuthConfig> {
  const url = `${normalizeSiteUrl(siteUrl)}${AUTH_CONFIG_PATH}`;

  const http =
    client ??
    axios.create({
      timeout: timeoutMs,
      headers: { Accept: 'application/json' },
      validateStatus: () => true,
    });

  try {
    const response = await http.get(url);
    if (response.status < 200 || response.status >= 300) {
      return FALLBACK_AUTH_CONFIG;
    }
    return sanitize(response.data);
  } catch {
    return FALLBACK_AUTH_CONFIG;
  }
}

/**
 * Coerce the server body into a safe AuthConfig.
 *
 * Provider entries are kept only when both id and label are non-empty strings,
 * and the id is slug-shaped — the id becomes a URL parameter and the label goes
 * on a button, so neither may carry arbitrary junk from a mis-serialized body.
 */
function sanitize(body: unknown): AuthConfig {
  if (typeof body !== 'object' || body === null) {
    return FALLBACK_AUTH_CONFIG;
  }
  const auth = (body as { auth?: unknown }).auth;
  if (typeof auth !== 'object' || auth === null) {
    return FALLBACK_AUTH_CONFIG;
  }

  const record = auth as Record<string, unknown>;

  const providers: AuthProvider[] = [];
  if (Array.isArray(record.social_providers)) {
    for (const entry of record.social_providers) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const id = (entry as { id?: unknown }).id;
      const label = (entry as { label?: unknown }).label;
      if (typeof id === 'string' && /^[a-z][a-z0-9_-]*$/.test(id) && typeof label === 'string' && label !== '') {
        providers.push({ id, label });
      }
    }
  }

  const connectUrl = typeof record.connect_url === 'string' ? record.connect_url : '';
  const appPasswords = record.app_passwords_available !== false;

  return {
    providers,
    twofactor: record.twofactor === true,
    register: record.register === true,
    connectUrl,
    // A bridge needs somewhere to land AND a site that can mint the credential.
    bridge: connectUrl !== '' && appPasswords,
  };
}
