/**
 * The session store, and the request-time header contract it backs.
 *
 * The test that matters most: getAuthHeader reflects the CURRENT state, so a sign-in or
 * sign-out is visible to the very next call without anything being rebuilt — that is the
 * whole reason the client registry reads its header late, and this is where the promise
 * is actually kept.
 */

import { getAuthHeader, isSignedIn, sessionStore } from './sessionStore';
import { basicAuthHeader, type AppCredential } from '../auth/appPassword';

const CRED: AppCredential = { userLogin: 'admin', password: 'abcd EFGH ijkl MNOP qrst UVWX' };
const SITE = 'https://buddynext.local';

beforeEach(() => {
  sessionStore.getState().reset();
});

describe('sign-in state', () => {
  it('starts signed out with no active site', () => {
    expect(sessionStore.getState().activeSiteUrl).toBeNull();
    expect(isSignedIn()).toBe(false);
    expect(getAuthHeader()).toBeNull();
  });

  it('setSession establishes a signed-in session', () => {
    sessionStore.getState().setSession(SITE, CRED);

    expect(sessionStore.getState().activeSiteUrl).toBe(SITE);
    expect(isSignedIn()).toBe(true);
    expect(getAuthHeader()).toBe(basicAuthHeader(CRED));
  });

  it('setActiveSite points at a site without signing in (the sign-in screen)', () => {
    sessionStore.getState().setActiveSite(SITE);

    expect(sessionStore.getState().activeSiteUrl).toBe(SITE);
    expect(isSignedIn()).toBe(false);
    expect(getAuthHeader()).toBeNull();
  });
});

describe('getAuthHeader reflects the CURRENT state', () => {
  it('flips from null to a header the instant a session is set', () => {
    // Simulates the registry reading auth at request time: same getter, different answer
    // as the store changes, nothing rebuilt.
    expect(getAuthHeader()).toBeNull();

    sessionStore.getState().setSession(SITE, CRED);
    expect(getAuthHeader()).toBe(basicAuthHeader(CRED));
  });

  it('drops the header the instant the credential is cleared (sign-out)', () => {
    sessionStore.getState().setSession(SITE, CRED);
    expect(getAuthHeader()).not.toBeNull();

    sessionStore.getState().clearCredential();
    expect(getAuthHeader()).toBeNull();
  });

  it('keeps the active site after a sign-out, so the sign-in screen knows where it is', () => {
    sessionStore.getState().setSession(SITE, CRED);
    sessionStore.getState().clearCredential();

    expect(sessionStore.getState().activeSiteUrl).toBe(SITE);
    expect(isSignedIn()).toBe(false);
  });
});

describe('reset', () => {
  it('clears both the site and the credential', () => {
    sessionStore.getState().setSession(SITE, CRED);
    sessionStore.getState().reset();

    expect(sessionStore.getState().activeSiteUrl).toBeNull();
    expect(sessionStore.getState().credential).toBeNull();
  });
});

describe('it drives the client registry end to end', () => {
  it('a registry built with getAuthHeader sees sign-in/out without a rebuild', async () => {
    // The two halves meeting: build the registry ONCE with the store's getter, then prove
    // the request header tracks the store.
    const { createClientRegistry } = await import('../api/clients');
    const registry = createClientRegistry({ siteUrl: SITE, getAuthHeader });
    const client = registry.getClient('buddynext/v1');

    const capture = async () => {
      let seen: string | undefined;
      client.defaults.adapter = async (config) => {
        seen = config.headers.get('Authorization') as string | undefined;
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
      };
      await client.request({ url: '/x' });
      return seen;
    };

    expect(await capture()).toBeUndefined();

    sessionStore.getState().setSession(SITE, CRED);
    expect(await capture()).toBe(basicAuthHeader(CRED));

    sessionStore.getState().clearCredential();
    expect(await capture()).toBeUndefined();
  });
});
