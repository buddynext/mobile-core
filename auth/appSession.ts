/**
 * The auth runtime — the thin layer that opens the browser and touches SecureStore.
 *
 * Everything decision-shaped is in appPassword.ts and tested. This file is the part that
 * cannot be a pure function: it drives `WebBrowser`, reads and writes the OS keychain, and
 * mints the per-install id. It is kept small on purpose — the less logic lives here, the
 * less lives where a unit test cannot reach.
 *
 * Verified on-device, not in the node suite (it imports expo-* native modules).
 */

import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';

import { credentialKey } from '../api/siteKey';
import {
  basicAuthHeader,
  buildAuthorizeUrl,
  parseAuthRedirect,
  type AppCredential,
  type RedirectFailure,
} from './appPassword';

/** The app's redirect scheme — must match `scheme` in app.json. */
const REDIRECT_SCHEME = 'buddynextapp';
const REDIRECT_URI = `${REDIRECT_SCHEME}://auth`;
const APP_NAME = 'BuddyNext';

/**
 * The stable per-install id key. One UUID per device, reused on every sign-in so wp-admin
 * shows ONE credential row per phone rather than a new row each time — SecureStore, not
 * app-config, because it must survive a sign-out (it identifies the device, not the
 * session).
 */
const APP_ID_KEY = 'bn.app_id';

export type SignInResult =
  | { ok: true; siteUrl: string; credential: AppCredential }
  | { ok: false; reason: RedirectFailure | 'cancelled' | 'dismissed' };

/**
 * Get (or mint once) this install's stable app id.
 *
 * randomUUID from expo-crypto is a real v4 UUID; generated the first time and persisted,
 * so a reinstall gets a new id (and a fresh credential row) while an ordinary relaunch
 * reuses the same one.
 */
export async function getAppId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(APP_ID_KEY);
  if (existing) {
    return existing;
  }
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(APP_ID_KEY, id);
  return id;
}

/**
 * Run the full Application-Passwords sign-in for a site.
 *
 * Opens core's authorize screen in an auth session, waits for the redirect, validates it
 * (scheme + site, in appPassword), and on success stores the credential keyed by site.
 * A cancel or a dismiss is a first-class result, not an error — the member changed their
 * mind, and the caller shows the sign-in screen again rather than an error banner.
 */
export async function signIn(siteUrl: string): Promise<SignInResult> {
  const appId = await getAppId();
  const authorizeUrl = buildAuthorizeUrl(siteUrl, {
    appName: APP_NAME,
    appId,
    redirectUri: REDIRECT_URI,
  });

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, REDIRECT_URI);

  if (result.type === 'cancel') {
    return { ok: false, reason: 'cancelled' };
  }
  if (result.type !== 'success') {
    return { ok: false, reason: 'dismissed' };
  }

  const parsed = parseAuthRedirect(result.url, { scheme: REDIRECT_SCHEME, siteUrl });
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }

  await SecureStore.setItemAsync(
    credentialKey(parsed.siteUrl),
    JSON.stringify(parsed.credential)
  );

  return { ok: true, siteUrl: parsed.siteUrl, credential: parsed.credential };
}

/** The stored credential for a site, or null if the member is signed out there. */
export async function loadCredential(siteUrl: string): Promise<AppCredential | null> {
  const raw = await SecureStore.getItemAsync(credentialKey(siteUrl));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AppCredential;
    if (parsed && typeof parsed.userLogin === 'string' && typeof parsed.password === 'string') {
      return parsed;
    }
    return null;
  } catch {
    // A corrupt entry is treated as signed-out; the next sign-in overwrites it.
    return null;
  }
}

/** Forget the credential for a site (sign-out). Leaves the app id — that is the device. */
export async function signOut(siteUrl: string): Promise<void> {
  await SecureStore.deleteItemAsync(credentialKey(siteUrl));
}

/**
 * The Authorization header for a site, or null when signed out.
 *
 * This is the shape the client registry wants for `getAuthHeader` — but note the registry
 * reads its header SYNCHRONOUSLY at request time, and this is async. The session store
 * bridges the two: it loads the credential once on sign-in / resume and exposes a
 * synchronous getter over the in-memory value. This helper is for the load, not the
 * per-request read.
 */
export async function authHeaderFor(siteUrl: string): Promise<string | null> {
  const credential = await loadCredential(siteUrl);
  return credential ? basicAuthHeader(credential) : null;
}
