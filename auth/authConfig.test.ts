/**
 * Auth-method discovery — the sign-in screen's server handshake.
 *
 * The load-bearing test is the 404/absent-block case: an OLDER plugin has no
 * auth block, and the result must be the fallback with `bridge: false`, which
 * is precisely what routes the screen through the legacy
 * authorize-application flow. Degrade, never break.
 *
 * Same harness as gate/bootstrap.test.ts: a real axios instance with a
 * stubbed adapter, so status handling is axios's own, not a fake's.
 */

import axios, { type AxiosAdapter } from 'axios';

import { FALLBACK_AUTH_CONFIG, fetchAuthConfig } from './authConfig';

/** An axios instance whose adapter returns a fixed status/body, and counts calls. */
function stubbed(status: number, data: unknown) {
  let calls = 0;
  const adapter: AxiosAdapter = async (config) => {
    calls += 1;
    return { data, status, statusText: '', headers: {}, config };
  };
  const client = axios.create({ adapter, validateStatus: () => true });
  return { client, calls: () => calls };
}

function offline() {
  const adapter: AxiosAdapter = async () => {
    throw new Error('ENOTFOUND');
  };
  return axios.create({ adapter, validateStatus: () => true });
}

const FULL_BODY = {
  contract_version: 1,
  auth: {
    social_providers: [
      { id: 'google', label: 'Google' },
      { id: 'apple', label: 'Apple' },
    ],
    twofactor: true,
    register: true,
    app_passwords_available: true,
    connect_url: 'https://site.com/login/connect-app/',
    connect_schemes: ['buddynextapp'],
  },
};

describe('fetchAuthConfig', () => {
  it('parses a full auth block', async () => {
    const { client } = stubbed(200, FULL_BODY);
    const config = await fetchAuthConfig('https://site.com', { client });

    expect(config).toEqual({
      providers: [
        { id: 'google', label: 'Google' },
        { id: 'apple', label: 'Apple' },
      ],
      twofactor: true,
      register: true,
      connectUrl: 'https://site.com/login/connect-app/',
      bridge: true,
    });
  });

  it('falls back on 404 — the OLDER-PLUGIN case that must route to the legacy flow', async () => {
    const { client } = stubbed(404, { code: 'rest_no_route' });
    expect(await fetchAuthConfig('https://site.com', { client })).toEqual(FALLBACK_AUTH_CONFIG);
  });

  it('falls back when the plugin predates the auth block (200, no auth key)', async () => {
    const { client } = stubbed(200, { contract_version: 1, app_enabled: true });
    const config = await fetchAuthConfig('https://site.com', { client });
    expect(config.bridge).toBe(false);
    expect(config.providers).toEqual([]);
  });

  it('falls back on 5xx and on a thrown transport error', async () => {
    const { client } = stubbed(500, 'Internal Server Error');
    expect(await fetchAuthConfig('https://site.com', { client })).toEqual(FALLBACK_AUTH_CONFIG);
    expect(await fetchAuthConfig('https://site.com', { client: offline() })).toEqual(
      FALLBACK_AUTH_CONFIG
    );
  });

  it('drops malformed provider entries instead of rendering junk buttons', async () => {
    const { client } = stubbed(200, {
      auth: {
        ...FULL_BODY.auth,
        social_providers: [
          { id: 'google', label: 'Google' },
          { id: 'BAD ID!', label: 'X' }, // Not slug-shaped: becomes a URL param.
          { id: 'apple' }, // No label: nothing to put on the button.
          'not-an-object',
          { id: '', label: 'Empty' },
        ],
      },
    });
    const config = await fetchAuthConfig('https://site.com', { client });
    expect(config.providers).toEqual([{ id: 'google', label: 'Google' }]);
  });

  it('reports no bridge when the site cannot mint app passwords', async () => {
    const { client } = stubbed(200, {
      auth: { ...FULL_BODY.auth, app_passwords_available: false },
    });
    const config = await fetchAuthConfig('https://site.com', { client });
    expect(config.bridge).toBe(false);
    // The providers are still reported — the WEB flows work; only the app bridge cannot.
    expect(config.providers).toHaveLength(2);
  });

  it('is never memoised — every call hits the network', async () => {
    const { client, calls } = stubbed(200, FULL_BODY);
    await fetchAuthConfig('https://site.com', { client });
    await fetchAuthConfig('https://site.com', { client });
    expect(calls()).toBe(2);
  });
});
