/**
 * The connect-app bridge, pure part.
 *
 * The load-bearing claims: the bridge URL is built FROM the discovered
 * connect_url (never a guessed path), the redirect is parsed by the SAME
 * parser the legacy flow uses (spaces-as-plus handling included), and the
 * state echo is enforced — a redirect this app did not initiate is refused
 * with its credential unstored, which is the login-CSRF guard.
 */

import { buildConnectUrl, parseBridgeRedirect } from './connect';

const PARAMS = {
  appName: 'BuddyNext',
  appId: '3f1d2f66-58f2-4b6a-9f3e-9adcae30c8aa',
  scheme: 'buddynextapp',
  state: 'nonce-1234',
};

describe('buildConnectUrl', () => {
  it('appends the contract params to the discovered URL', () => {
    const url = buildConnectUrl('https://site.com/login/connect-app/', PARAMS);

    expect(url.startsWith('https://site.com/login/connect-app/?')).toBe(true);
    const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(query.get('app_name')).toBe('BuddyNext');
    expect(query.get('app_id')).toBe(PARAMS.appId);
    expect(query.get('scheme')).toBe('buddynextapp');
    expect(query.get('state')).toBe('nonce-1234');
    expect(query.get('provider')).toBeNull();
  });

  it('carries the provider preselect only when given', () => {
    const url = buildConnectUrl('https://site.com/login/connect-app/', {
      ...PARAMS,
      provider: 'apple',
    });
    expect(new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('provider')).toBe('apple');
  });

  it('honours a renamed auth slug — the URL is the server_s, verbatim', () => {
    const url = buildConnectUrl('https://site.com/signin/connect-app/', PARAMS);
    expect(url.startsWith('https://site.com/signin/connect-app/?')).toBe(true);
  });

  it('survives a connect URL that already carries a query', () => {
    const url = buildConnectUrl('https://site.com/?bn_hub=auth&bn_auth_action=connect-app', PARAMS);
    expect(url).toContain('&app_name=BuddyNext');
    expect(url.indexOf('?')).toBe(url.lastIndexOf('?'));
  });

  it('URL-encodes an app name with spaces', () => {
    const url = buildConnectUrl('https://site.com/login/connect-app/', {
      ...PARAMS,
      appName: 'My Community App',
    });
    expect(url).toContain('app_name=My+Community+App');
  });
});

describe('parseBridgeRedirect', () => {
  const SITE = 'https://site.com';

  /** A bridge redirect exactly as the plugin's deep_link() emits it. */
  function redirect(state: string, password = 'abcd+EFGH+ijkl+MNOP+qrst+uvwx'): string {
    return (
      `buddynextapp://auth?site_url=${encodeURIComponent(SITE)}` +
      `&user_login=alice&password=${password}&state=${state}`
    );
  }

  it('round-trips a bridge redirect through the SHARED parser, spaces intact', () => {
    const result = parseBridgeRedirect(redirect('nonce-1234'), {
      scheme: 'buddynextapp',
      siteUrl: SITE,
      state: 'nonce-1234',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential.userLogin).toBe('alice');
      // The + encodes a space — the documented core gotcha, inherited correctly.
      expect(result.credential.password).toBe('abcd EFGH ijkl MNOP qrst uvwx');
    }
  });

  it('refuses a redirect whose state this app never generated (login CSRF)', () => {
    const result = parseBridgeRedirect(redirect('attacker-state'), {
      scheme: 'buddynextapp',
      siteUrl: SITE,
      state: 'nonce-1234',
    });
    expect(result).toEqual({ ok: false, reason: 'state-mismatch' });
  });

  it('refuses a redirect with NO state when one is expected', () => {
    const url = `buddynextapp://auth?site_url=${encodeURIComponent(SITE)}&user_login=alice&password=x`;
    const result = parseBridgeRedirect(url, {
      scheme: 'buddynextapp',
      siteUrl: SITE,
      state: 'nonce-1234',
    });
    expect(result).toEqual({ ok: false, reason: 'state-mismatch' });
  });

  it('keeps the shared parser_s checks: wrong site and wrong scheme still refuse', () => {
    const wrongSite = parseBridgeRedirect(redirect('nonce-1234'), {
      scheme: 'buddynextapp',
      siteUrl: 'https://other-site.com',
      state: 'nonce-1234',
    });
    expect(wrongSite).toEqual({ ok: false, reason: 'site-mismatch' });

    const wrongScheme = parseBridgeRedirect('otherapp://auth?x=1', {
      scheme: 'buddynextapp',
      siteUrl: SITE,
      state: 'nonce-1234',
    });
    expect(wrongScheme).toEqual({ ok: false, reason: 'not-our-redirect' });
  });

  it('reads a cancel (no credential fields) as missing-fields, before the state check', () => {
    const result = parseBridgeRedirect('buddynextapp://auth?success=false', {
      scheme: 'buddynextapp',
      siteUrl: SITE,
      state: 'nonce-1234',
    });
    expect(result).toEqual({ ok: false, reason: 'missing-fields' });
  });
});
