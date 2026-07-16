/**
 * The client registry, exercised through REAL axios instances.
 *
 * No network: a custom axios adapter captures the fully-assembled request config and
 * resolves a fake 200. That is the honest way to test this — the behaviour under test
 * (an interceptor reading auth at request time, base-URL assembly, memoisation) lives
 * inside axios's own request pipeline, which a hand-rolled fake would not run.
 */

import type { AxiosRequestConfig } from 'axios';

import { createClientRegistry } from './clients';

/**
 * Drive one client and hand back the config axios actually assembled for the request:
 * interceptors applied, headers resolved, baseURL + url joined.
 */
async function capture(
  instance: ReturnType<ReturnType<typeof createClientRegistry>['getClient']>,
  requestConfig: AxiosRequestConfig = {}
): Promise<AxiosRequestConfig> {
  let seen: AxiosRequestConfig | undefined;
  instance.defaults.adapter = async (config) => {
    seen = config;
    return {
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  await instance.request({ url: '/probe', ...requestConfig });
  return seen!;
}

describe('base URL — one slash at each seam', () => {
  it('joins site + wp-json + namespace', () => {
    const reg = createClientRegistry({
      siteUrl: 'https://site.com',
      getAuthHeader: () => null,
    });
    expect(reg.getClient('buddynext/v1').defaults.baseURL).toBe(
      'https://site.com/wp-json/buddynext/v1'
    );
  });

  it('does not double a slash when the site URL has a trailing one', () => {
    const reg = createClientRegistry({
      siteUrl: 'https://site.com/',
      getAuthHeader: () => null,
    });
    expect(reg.getClient('mvs/v1').defaults.baseURL).toBe('https://site.com/wp-json/mvs/v1');
  });

  it('keeps a subdirectory multisite path in the base URL', () => {
    const reg = createClientRegistry({
      siteUrl: 'https://site.com/community',
      getAuthHeader: () => null,
    });
    expect(reg.getClient('jetonomy/v1').defaults.baseURL).toBe(
      'https://site.com/community/wp-json/jetonomy/v1'
    );
  });

  it('serves every namespace the app speaks', () => {
    const reg = createClientRegistry({ siteUrl: 'https://site.com', getAuthHeader: () => null });
    for (const ns of ['buddynext/v1', 'buddynext-pro/v1', 'mvs/v1', 'mvs-pro/v1', 'jetonomy/v1']) {
      expect(reg.getClient(ns).defaults.baseURL).toBe(`https://site.com/wp-json/${ns}`);
    }
  });
});

describe('memoisation', () => {
  it('returns the same instance for the same namespace', () => {
    const reg = createClientRegistry({ siteUrl: 'https://site.com', getAuthHeader: () => null });
    expect(reg.getClient('buddynext/v1')).toBe(reg.getClient('buddynext/v1'));
  });

  it('returns different instances for different namespaces', () => {
    const reg = createClientRegistry({ siteUrl: 'https://site.com', getAuthHeader: () => null });
    expect(reg.getClient('buddynext/v1')).not.toBe(reg.getClient('mvs/v1'));
  });

  it('gives two registries (two sites) independent instances', () => {
    const a = createClientRegistry({ siteUrl: 'https://a.com', getAuthHeader: () => null });
    const b = createClientRegistry({ siteUrl: 'https://b.com', getAuthHeader: () => null });
    expect(a.getClient('buddynext/v1')).not.toBe(b.getClient('buddynext/v1'));
  });
});

describe('auth is read at REQUEST time — the whole point', () => {
  it('attaches the current header', async () => {
    const reg = createClientRegistry({
      siteUrl: 'https://site.com',
      getAuthHeader: () => 'Basic dXNlcjpwYXNz',
    });

    const config = await capture(reg.getClient('buddynext/v1'));

    expect(config.headers?.Authorization).toBe('Basic dXNlcjpwYXNz');
  });

  it('picks up a sign-in on the NEXT call without rebuilding the client', async () => {
    // The behaviour that justifies the design. One instance, built once, signed out. A
    // sign-in happens. The very next request on that SAME instance carries the new
    // credential — nothing was torn down or recreated.
    let header: string | null = null;
    const reg = createClientRegistry({
      siteUrl: 'https://site.com',
      getAuthHeader: () => header,
    });
    const client = reg.getClient('buddynext/v1');

    const before = await capture(client);
    expect(before.headers?.Authorization).toBeUndefined();

    header = 'Basic dXNlcjpwYXNz'; // sign-in mid-session

    const after = await capture(client);
    expect(after.headers?.Authorization).toBe('Basic dXNlcjpwYXNz');
  });

  it('drops the header again on sign-out, on the same instance', async () => {
    // The reverse must hold too, or a signed-out member keeps sending a stale credential.
    let header: string | null = 'Basic dXNlcjpwYXNz';
    const reg = createClientRegistry({
      siteUrl: 'https://site.com',
      getAuthHeader: () => header,
    });
    const client = reg.getClient('buddynext/v1');

    expect((await capture(client)).headers?.Authorization).toBe('Basic dXNlcjpwYXNz');

    header = null; // sign-out

    expect((await capture(client)).headers?.Authorization).toBeUndefined();
  });

  it('sends no Authorization header when signed out (public reads)', async () => {
    const reg = createClientRegistry({ siteUrl: 'https://site.com', getAuthHeader: () => null });

    const config = await capture(reg.getClient('buddynext/v1'));

    expect(config.headers?.Authorization).toBeUndefined();
  });

  it('strips a caller-supplied Authorization when signed out — the registry owns auth', async () => {
    // The registry is the single source of the credential. A caller that hand-sets an
    // Authorization header while signed out must not have it sent: that is how a stale or
    // wrong credential leaks past the one place that is supposed to decide auth. This is
    // the scenario the interceptor's `else delete` branch exists for.
    const reg = createClientRegistry({ siteUrl: 'https://site.com', getAuthHeader: () => null });

    const config = await capture(reg.getClient('buddynext/v1'), {
      headers: { Authorization: 'Basic c3RhbGU6Y3JlZA==' },
    });

    expect(config.headers?.Authorization).toBeUndefined();
  });

  it('lets the registry credential win over a caller-supplied one', async () => {
    // Signed in: the registry's header replaces whatever the caller passed, so no call
    // site can override the connected identity by accident.
    const reg = createClientRegistry({
      siteUrl: 'https://site.com',
      getAuthHeader: () => 'Basic dXNlcjpyaWdodA==',
    });

    const config = await capture(reg.getClient('buddynext/v1'), {
      headers: { Authorization: 'Basic d3Jvbmc6b25l' },
    });

    expect(config.headers?.Authorization).toBe('Basic dXNlcjpyaWdodA==');
  });
});

describe('request hardening', () => {
  it('applies a default timeout so a stalled network cannot hang a screen forever', () => {
    const reg = createClientRegistry({ siteUrl: 'https://site.com', getAuthHeader: () => null });
    expect(reg.getClient('buddynext/v1').defaults.timeout).toBe(20_000);
  });

  it('honours an explicit timeout', () => {
    const reg = createClientRegistry({
      siteUrl: 'https://site.com',
      getAuthHeader: () => null,
      timeoutMs: 5_000,
    });
    expect(reg.getClient('buddynext/v1').defaults.timeout).toBe(5_000);
  });
});
