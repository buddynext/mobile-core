/**
 * Session state — who is signed in, to which site, right now.
 *
 * ARCHITECTURE.md "State & data": React Query holds server data; zustand holds
 * session/device state — auth, active site, theme override, drafts. This is the auth
 * slice. It is the in-memory home of the credential so the client registry can read a
 * header SYNCHRONOUSLY at request time, while the credential's durable copy lives in
 * SecureStore (appSession.ts).
 *
 * Built on `zustand/vanilla` — no React — so the store is node-testable and the barrel it
 * lives behind never drags react-native into the node suite. The app subscribes to it
 * with zustand's `useStore` hook; nothing here imports React.
 *
 * Why in-memory AND SecureStore, not one or the other: SecureStore is async (a request
 * interceptor cannot await it), and a value kept only in memory would not survive a cold
 * start. So the durable copy is loaded from SecureStore once on boot/resume into this
 * store, and every request reads the fast in-memory copy.
 */

import { createStore } from 'zustand/vanilla';

import { basicAuthHeader, type AppCredential } from '../auth/appPassword';

export interface SessionState {
  /** The site the app is currently connected to, normalised, or null before connect. */
  activeSiteUrl: string | null;
  /** The active site's credential, or null when signed out there. */
  credential: AppCredential | null;

  /** Establish a signed-in session. Called after a successful sign-in or a boot restore. */
  setSession: (siteUrl: string, credential: AppCredential) => void;
  /** Point at a site without a credential yet (the sign-in screen's state). */
  setActiveSite: (siteUrl: string) => void;
  /** Sign out of the active site — clears the credential, keeps the active site. */
  clearCredential: () => void;
  /** Full reset (e.g. switching away from a site entirely). */
  reset: () => void;
}

export const sessionStore = createStore<SessionState>((set) => ({
  activeSiteUrl: null,
  credential: null,

  setSession: (siteUrl, credential) => set({ activeSiteUrl: siteUrl, credential }),
  setActiveSite: (siteUrl) => set({ activeSiteUrl: siteUrl, credential: null }),
  clearCredential: () => set({ credential: null }),
  reset: () => set({ activeSiteUrl: null, credential: null }),
}));

/**
 * The synchronous header source the client registry wants.
 *
 * `createClientRegistry({ getAuthHeader })` calls this inside a request interceptor, once
 * per request, with no await. It reads the CURRENT in-memory credential, so a sign-in or
 * sign-out that updated the store applies to the very next request — the request-time-auth
 * contract the registry was built around, now backed by real state.
 */
export function getAuthHeader(): string | null {
  const { credential } = sessionStore.getState();
  return credential ? basicAuthHeader(credential) : null;
}

/** True when the active site has a credential. */
export function isSignedIn(): boolean {
  return sessionStore.getState().credential !== null;
}
