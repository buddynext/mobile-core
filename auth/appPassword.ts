/**
 * WordPress core Application Passwords — the auth handshake, pure part.
 *
 * The rule for the whole fleet (SKILL.md hard rule 1): auth is WP core Application
 * Passwords, no JWT, no custom /auth/token. The app opens core
 * `authorize-application.php`, the member approves, core redirects back with a
 * newly-minted credential, and every REST call thereafter sends
 * `Authorization: Basic base64(login:password)`. We never duplicate what core gives.
 *
 * This file is the logic around that: build the authorize URL, parse the redirect,
 * assemble the header. The `WebBrowser` that opens the URL and the `SecureStore` that
 * holds the result are the thin runtime layer (appSession.ts); everything decision-
 * shaped is here, and tested.
 *
 * THE DOCUMENTED GOTCHA lives in parseAuthRedirect: core hands the app password back as
 * six space-separated groups, and in the redirect URL those spaces arrive as `+`.
 * `decodeURIComponent` does NOT turn `+` into a space — only form-decoding does — so the
 * naive parse keeps literal `+` in the password. See parseAuthRedirect.
 */

import { normalizeSiteUrl } from '../api/siteKey';

/** A stored credential: everything needed to rebuild the Authorization header. */
export interface AppCredential {
  /** The WordPress user login the credential belongs to. */
  userLogin: string;
  /** The application password, in core's canonical spaced form. */
  password: string;
}

export interface AuthorizeParams {
  /** Shown to the member on the approval screen and as the credential's name in wp-admin. */
  appName: string;
  /**
   * A STABLE per-install UUID. Core keys the credential row on it, so reusing the same
   * app_id means one row per device instead of a new row on every sign-in.
   */
  appId: string;
  /** The custom-scheme URL core redirects back to, e.g. `buddynextapp://auth`. */
  redirectUri: string;
}

/**
 * Build the core authorize-application URL.
 *
 * `success_url` is where core sends the member back with the credential; `reject_url` is
 * omitted deliberately so core uses its default (a cancel simply returns no credential,
 * which appSession reads as "member backed out").
 */
export function buildAuthorizeUrl(siteUrl: string, params: AuthorizeParams): string {
  const base = `${normalizeSiteUrl(siteUrl)}/wp-admin/authorize-application.php`;
  const query = new URLSearchParams({
    app_name: params.appName,
    app_id: params.appId,
    success_url: params.redirectUri,
  });
  return `${base}?${query.toString()}`;
}

export type RedirectResult =
  | { ok: true; siteUrl: string; credential: AppCredential }
  | { ok: false; reason: RedirectFailure };

export type RedirectFailure =
  | 'not-our-redirect'
  | 'missing-fields'
  | 'site-mismatch'
  | 'unparseable';

/**
 * Form-decode ONE query value: `%XX` escapes AND `+` as space.
 *
 * This is the crux of the gotcha. `decodeURIComponent('a+b')` is `'a+b'` — it leaves the
 * plus. Application passwords come as `abcd EFGH ...`, whose spaces core sends as `+`, so
 * `decodeURIComponent` alone yields `abcd+EFGH+...` with literal pluses baked into the
 * password. Replacing `+` with a space BEFORE decoding is what form-encoding requires and
 * what URLSearchParams does internally; doing it by hand keeps the fix explicit and
 * un-bypassable.
 */
function formDecode(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

/**
 * Parse the query string of a redirect by hand.
 *
 * Hand-parsed rather than via `new URL(...).searchParams` because the redirect uses a
 * custom scheme (`buddynextapp://`), and custom-scheme URL parsing is inconsistent across
 * the JS engines we ship on (Hermes vs node). Splitting on the first `?` and decoding each
 * pair is engine-independent.
 */
function parseQuery(url: string): Record<string, string> | null {
  const q = url.indexOf('?');
  if (q === -1) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const pair of url.slice(q + 1).split('&')) {
    if (!pair) {
      continue;
    }
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? '' : pair.slice(eq + 1);
    try {
      out[formDecode(rawKey)] = formDecode(rawVal);
    } catch {
      // A malformed %XX escape. Treat the whole redirect as unparseable rather than
      // silently keeping a half-decoded credential.
      return null;
    }
  }
  return out;
}

/**
 * Parse core's redirect into a credential.
 *
 * `expected.scheme` and `expected.siteUrl` are checked, not trusted: a redirect that does
 * not start with our scheme is not our redirect (something intercepted the flow), and a
 * `site_url` that does not match the site we started the flow for is a credential for the
 * wrong place — refuse both rather than store them.
 */
export function parseAuthRedirect(
  returnUrl: string,
  expected: { scheme: string; siteUrl: string }
): RedirectResult {
  const schemePrefix = `${expected.scheme}://`;
  if (!returnUrl.startsWith(schemePrefix)) {
    return { ok: false, reason: 'not-our-redirect' };
  }

  const params = parseQuery(returnUrl);
  if (!params) {
    return { ok: false, reason: 'unparseable' };
  }

  const userLogin = params.user_login ?? '';
  const password = params.password ?? '';
  const siteUrl = params.site_url ?? '';

  if (!userLogin || !password || !siteUrl) {
    // A cancel/decline comes back with no credential fields — the caller reads this as
    // "member backed out", not an error to surface as a failure.
    return { ok: false, reason: 'missing-fields' };
  }

  if (normalizeSiteUrl(siteUrl) !== normalizeSiteUrl(expected.siteUrl)) {
    return { ok: false, reason: 'site-mismatch' };
  }

  return {
    ok: true,
    siteUrl: normalizeSiteUrl(siteUrl),
    credential: { userLogin, password },
  };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 of a UTF-8 string, dependency-free.
 *
 * Hermes ships no `btoa`, and pulling a base64 package for one call is not worth it. This
 * encodes via TextEncoder (present in both node and Hermes) so a non-ASCII login is
 * handled correctly rather than mangled.
 */
function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

/**
 * The `Authorization` header value for a credential.
 *
 * The password is sent in its spaced form exactly as core minted it; core strips
 * non-alphanumerics before comparing, so spaces are harmless — and NOT stripping them
 * keeps the stored credential byte-identical to what the member could read in wp-admin,
 * which matters the day someone has to debug a mismatch.
 */
export function basicAuthHeader(credential: AppCredential): string {
  return `Basic ${base64(`${credential.userLogin}:${credential.password}`)}`;
}
