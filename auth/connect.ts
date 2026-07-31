/**
 * The connect-app bridge — the plugin-rendered sign-in handshake, pure part.
 *
 * The legacy flow (appPassword.ts) opens WP core's `authorize-application.php`:
 * functional, but it shows an ordinary member wp-admin chrome, other plugins'
 * notices, and "New Application Password Name". The bridge replaces the SCREEN,
 * not the credential: the plugin serves `{auth}/connect-app/` inside the site's
 * own branded login (so password, Google, Apple and two-factor all work — it IS
 * the site login), and its approve step redirects back with the same
 * `scheme://auth?site_url&user_login&password` query core produces. One parser
 * (`parseAuthRedirect`) serves both flows; this file adds only what the bridge
 * adds.
 *
 * What it adds is the STATE NONCE. The bridge echoes an app-generated `state`
 * back on the redirect, and `parseBridgeRedirect` refuses a redirect whose echo
 * does not match. Custom schemes are claimable by any installed app, and on the
 * receiving side any app can also SEND one — without the echo check, a page the
 * member merely visited could push `buddynextapp://auth?...` with an
 * attacker-controlled credential and sign the app into an account the attacker
 * owns (login CSRF). The nonce makes the app accept only redirects answering a
 * flow it started itself.
 *
 * The bridge URL is DISCOVERED, never assumed: the plugin publishes
 * `auth.connect_url` in `/app/config` (see authConfig.ts) because the auth slug
 * is site-configurable — `/login/` on one site is `/signin/` on the next. A
 * hardcoded path here would break on every renamed site.
 */

import { parseAuthRedirect, type RedirectFailure, type RedirectResult } from './appPassword';

export interface ConnectParams {
  /** Shown on the approve screen and used as the credential's label. */
  appName: string;
  /** The stable per-install UUID; the plugin replaces (not stacks) rows per app_id. */
  appId: string;
  /** Our custom scheme, e.g. `buddynextapp` — must be on the site's allowlist. */
  scheme: string;
  /** App-generated nonce the bridge echoes back; see parseBridgeRedirect. */
  state: string;
  /** Optional provider preselect (`google`, `apple`): skip the chooser, start that OAuth flow. */
  provider?: string;
}

/**
 * Build the bridge URL from the DISCOVERED connect URL plus our parameters.
 *
 * `connectUrl` comes from `/app/config`'s `auth.connect_url` verbatim. The
 * query is appended with URLSearchParams so an app name with spaces or a
 * non-ASCII site name survives encoding.
 */
export function buildConnectUrl(connectUrl: string, params: ConnectParams): string {
  const query = new URLSearchParams({
    app_name: params.appName,
    app_id: params.appId,
    scheme: params.scheme,
    state: params.state,
  });
  if (params.provider) {
    query.set('provider', params.provider);
  }
  const joiner = connectUrl.includes('?') ? '&' : '?';
  return `${connectUrl}${joiner}${query.toString()}`;
}

export type BridgeRedirectResult =
  | RedirectResult
  | { ok: false; reason: RedirectFailure | 'state-mismatch' };

/**
 * Parse a bridge redirect: everything `parseAuthRedirect` checks, PLUS the
 * state echo.
 *
 * The state arrives `+`-safe (it is a UUID, no spaces), but it is read from the
 * same form-decoded query the credential comes from, so any future state shape
 * survives encoding too. A missing or different echo is a redirect this app
 * never asked for — refused, and the credential inside it never stored.
 */
export function parseBridgeRedirect(
  returnUrl: string,
  expected: { scheme: string; siteUrl: string; state: string }
): BridgeRedirectResult {
  const parsed = parseAuthRedirect(returnUrl, {
    scheme: expected.scheme,
    siteUrl: expected.siteUrl,
  });
  if (!parsed.ok) {
    return parsed;
  }

  const echoed = readStateParam(returnUrl);
  if (echoed !== expected.state) {
    return { ok: false, reason: 'state-mismatch' };
  }

  return parsed;
}

/**
 * Read the raw `state` query value from a custom-scheme URL.
 *
 * Hand-parsed for the same reason parseAuthRedirect hand-parses: custom-scheme
 * URL parsing is inconsistent across the JS engines we ship on.
 */
function readStateParam(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) {
    return '';
  }
  for (const pair of url.slice(q + 1).split('&')) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (key === 'state') {
      const raw = eq === -1 ? '' : pair.slice(eq + 1);
      try {
        return decodeURIComponent(raw.replace(/\+/g, ' '));
      } catch {
        return '';
      }
    }
  }
  return '';
}
