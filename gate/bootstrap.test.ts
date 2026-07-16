/**
 * The boot handshake — fetch app-config, decide the gate.
 *
 * Driven through a real axios instance with a stubbed adapter, one per scenario, so the
 * status/validateStatus/timeout behaviour under test is axios's own, not a fake's.
 *
 * The load-bearing property — "never persisted, never memoised" — is structural: it is
 * asserted here as "every call hits the network", because a cache is exactly what would
 * make the second call skip it, and a skipped fetch is a stale `app_enabled` surviving
 * across a licence expiry.
 */

import axios, { type AxiosAdapter } from 'axios';

import { bootstrapAppGate, fetchAppConfig } from './bootstrap';

const APP = { appVersion: '1.0.0', understoodContract: 1 };

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

/** An axios instance whose adapter always throws — offline, DNS, TLS, timeout. */
function offline() {
  const adapter: AxiosAdapter = async () => {
    throw new Error('ENOTFOUND');
  };
  return axios.create({ adapter, validateStatus: () => true });
}

const validConfig = {
  contract_version: 1,
  app_enabled: true,
  pro_active: true,
  min_app_version: '',
};

describe('fetchAppConfig classifies the outcome for the gate', () => {
  it('reports reachable + body on a 200', async () => {
    const { client } = stubbed(200, validConfig);
    const result = await fetchAppConfig('https://site.com', { client });
    expect(result).toEqual({ reachable: true, body: validConfig });
  });

  it('reports UNREACHABLE when the request throws (offline)', async () => {
    const result = await fetchAppConfig('https://site.com', { client: offline() });
    expect(result).toEqual({ reachable: false });
  });

  it('reports UNREACHABLE on a 5xx (transient — retry, do not brand not-BuddyNext)', async () => {
    const { client } = stubbed(502, '<html>Bad Gateway</html>');
    expect(await fetchAppConfig('https://site.com', { client })).toEqual({ reachable: false });
  });

  it('reports REACHABLE on a 404 (site is up, plugin absent -> gate says not-buddynext)', async () => {
    // The boundary case, deliberately reachable: "check your connection" would be the
    // wrong screen for a WordPress site that simply is not running BuddyNext.
    const { client } = stubbed(404, { code: 'rest_no_route' });
    const result = await fetchAppConfig('https://site.com', { client });
    expect(result.reachable).toBe(true);
  });

  it('does not throw on any status', async () => {
    const { client } = stubbed(403, { forbidden: true });
    await expect(fetchAppConfig('https://site.com', { client })).resolves.toBeDefined();
  });

  it('requests the public app/config path on the normalised site', async () => {
    let requested = '';
    const adapter: AxiosAdapter = async (config) => {
      requested = `${config.baseURL ?? ''}${config.url ?? ''}`;
      return { data: validConfig, status: 200, statusText: '', headers: {}, config };
    };
    const client = axios.create({ adapter, validateStatus: () => true });

    await fetchAppConfig('https://Site.com/', { client });

    expect(requested).toBe('https://site.com/wp-json/buddynext/v1/app/config');
  });
});

describe('never cached — the licensing-hole guard', () => {
  it('hits the network on EVERY call', async () => {
    // A memo or a persisted read would let a stale app_enabled:true survive a licence
    // expiry. Two calls, two fetches — the permission is re-earned each time.
    const { client, calls } = stubbed(200, validConfig);

    await fetchAppConfig('https://site.com', { client });
    await fetchAppConfig('https://site.com', { client });

    expect(calls()).toBe(2);
  });
});

describe('bootstrapAppGate composes fetch + gate', () => {
  it('opens on a reachable, licensed, in-contract site', async () => {
    const { client } = stubbed(200, validConfig);
    const status = await bootstrapAppGate('https://site.com', APP, { client });
    expect(status.ok).toBe(true);
  });

  it('is unreachable when offline', async () => {
    const status = await bootstrapAppGate('https://site.com', APP, { client: offline() });
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('unreachable');
  });

  it('is not-buddynext when a WordPress site has no plugin (404 body)', async () => {
    const { client } = stubbed(404, { code: 'rest_no_route' });
    const status = await bootstrapAppGate('https://site.com', APP, { client });
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('not-buddynext');
  });

  it('is app-disabled when reachable but unlicensed', async () => {
    const { client } = stubbed(200, { ...validConfig, app_enabled: false });
    const status = await bootstrapAppGate('https://site.com', APP, { client });
    expect(status.ok).toBe(false);
    expect(!status.ok && status.reason).toBe('app-disabled');
  });

  it('re-decides fresh each call — a resume can flip open to closed', async () => {
    // Cold start: licensed. Later resume: licence expired server-side. The gate must
    // reflect the new answer, which it only can because nothing was cached.
    const licensed = stubbed(200, validConfig);
    const open = await bootstrapAppGate('https://site.com', APP, { client: licensed.client });
    expect(open.ok).toBe(true);

    const expired = stubbed(200, { ...validConfig, app_enabled: false });
    const closed = await bootstrapAppGate('https://site.com', APP, { client: expired.client });
    expect(closed.ok).toBe(false);
    expect(!closed.ok && closed.reason).toBe('app-disabled');
  });
});
