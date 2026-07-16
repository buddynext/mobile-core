/**
 * Application Passwords — the pure handshake.
 *
 * The centrepiece is the redirect parser, and specifically the `+`-for-space gotcha:
 * there is an explicit test that a naive decodeURIComponent would fail and this does not.
 * The security checks (wrong scheme, wrong site) matter as much as the happy path — a
 * credential stored for the wrong site is worse than a failed sign-in.
 */

import {
  basicAuthHeader,
  buildAuthorizeUrl,
  parseAuthRedirect,
} from './appPassword';

const SCHEME = 'buddynextapp';
const SITE = 'https://buddynext.local';
const REDIRECT = `${SCHEME}://auth`;

/** A realistic app password: six groups of four, space-separated, as core mints it. */
const APP_PASSWORD = 'abcd EFGH ijkl MNOP qrst UVWX';
/** The same, as it arrives in the redirect URL — spaces encoded as `+`. */
const APP_PASSWORD_PLUSED = 'abcd+EFGH+ijkl+MNOP+qrst+UVWX';

const redirect = (params: Record<string, string>): string => {
  const q = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${REDIRECT}?${q}`;
};

describe('buildAuthorizeUrl', () => {
  it('targets core authorize-application.php with the app identity and success_url', () => {
    const url = buildAuthorizeUrl(SITE, {
      appName: 'BuddyNext',
      appId: 'stable-uuid',
      redirectUri: REDIRECT,
    });

    expect(url).toContain('https://buddynext.local/wp-admin/authorize-application.php?');
    expect(url).toContain('app_name=BuddyNext');
    expect(url).toContain('app_id=stable-uuid');
    expect(url).toContain(`success_url=${encodeURIComponent(REDIRECT)}`);
  });

  it('normalises the site URL so a trailing slash does not double up', () => {
    const url = buildAuthorizeUrl('https://buddynext.local/', {
      appName: 'BuddyNext',
      appId: 'x',
      redirectUri: REDIRECT,
    });
    expect(url).toContain('https://buddynext.local/wp-admin/authorize-application.php');
  });
});

describe('parseAuthRedirect — the +-for-space gotcha', () => {
  it('decodes + in the password to a space (a naive decodeURIComponent would not)', () => {
    const result = parseAuthRedirect(
      redirect({
        site_url: encodeURIComponent(SITE),
        user_login: 'admin',
        password: APP_PASSWORD_PLUSED,
      }),
      { scheme: SCHEME, siteUrl: SITE }
    );

    expect(result.ok).toBe(true);
    // The whole point: spaces, not literal pluses.
    expect(result.ok && result.credential.password).toBe(APP_PASSWORD);
    expect(result.ok && result.credential.password).not.toContain('+');
  });

  it('also accepts %20-encoded spaces', () => {
    const result = parseAuthRedirect(
      redirect({
        site_url: encodeURIComponent(SITE),
        user_login: 'admin',
        password: 'abcd%20EFGH%20ijkl%20MNOP%20qrst%20UVWX',
      }),
      { scheme: SCHEME, siteUrl: SITE }
    );
    expect(result.ok && result.credential.password).toBe(APP_PASSWORD);
  });

  it('distinguishes an encoded space (+) from an encoded plus (%2B)', () => {
    // The subtlety that makes the gotcha fix correct rather than a blunt find-replace.
    // A bare `+` is an encoded SPACE (how core sends the password's group separators) and
    // must become a space. A real `+` in a value is sent as `%2B` and must STAY a plus.
    // Same parser, both right: the password gains spaces, the login keeps its plus.
    const result = parseAuthRedirect(
      redirect({
        site_url: encodeURIComponent(SITE),
        user_login: encodeURIComponent('jane+doe@site.com'), // real plus -> %2B
        password: APP_PASSWORD_PLUSED, // spaces -> bare +
      }),
      { scheme: SCHEME, siteUrl: SITE }
    );
    expect(result.ok && result.credential.userLogin).toBe('jane+doe@site.com');
    expect(result.ok && result.credential.password).toBe(APP_PASSWORD);
  });
});

describe('parseAuthRedirect — security checks', () => {
  it('rejects a redirect that is not our scheme', () => {
    const result = parseAuthRedirect(
      `evil://auth?site_url=${encodeURIComponent(SITE)}&user_login=admin&password=${APP_PASSWORD_PLUSED}`,
      { scheme: SCHEME, siteUrl: SITE }
    );
    expect(result).toEqual({ ok: false, reason: 'not-our-redirect' });
  });

  it('rejects a credential minted for a DIFFERENT site', () => {
    // The dangerous case: a valid-looking redirect whose site_url is not the site we
    // started the flow for. Storing this hands one site a credential for another.
    const result = parseAuthRedirect(
      redirect({
        site_url: encodeURIComponent('https://evil.example.com'),
        user_login: 'admin',
        password: APP_PASSWORD_PLUSED,
      }),
      { scheme: SCHEME, siteUrl: SITE }
    );
    expect(result).toEqual({ ok: false, reason: 'site-mismatch' });
  });

  it('treats an empty-credential redirect as the member backing out', () => {
    const result = parseAuthRedirect(redirect({ site_url: encodeURIComponent(SITE) }), {
      scheme: SCHEME,
      siteUrl: SITE,
    });
    expect(result).toEqual({ ok: false, reason: 'missing-fields' });
  });

  it('accepts the site despite a trailing-slash / case difference', () => {
    const result = parseAuthRedirect(
      redirect({
        site_url: encodeURIComponent('https://BuddyNext.local/'),
        user_login: 'admin',
        password: APP_PASSWORD_PLUSED,
      }),
      { scheme: SCHEME, siteUrl: SITE }
    );
    expect(result.ok).toBe(true);
  });

  it('does not crash on a malformed percent-escape', () => {
    const result = parseAuthRedirect(`${REDIRECT}?password=%ZZ&user_login=admin&site_url=x`, {
      scheme: SCHEME,
      siteUrl: SITE,
    });
    expect(result.ok).toBe(false);
  });
});

describe('basicAuthHeader', () => {
  it('produces Basic base64(login:password)', () => {
    // Verified against an independent base64 of the exact string.
    const header = basicAuthHeader({ userLogin: 'admin', password: APP_PASSWORD });
    const expected = 'Basic ' + Buffer.from(`admin:${APP_PASSWORD}`, 'utf8').toString('base64');
    expect(header).toBe(expected);
  });

  it('keeps the password spaced exactly as core minted it', () => {
    // Core strips non-alphanumerics before comparing, so spaces are harmless; keeping the
    // credential byte-identical to wp-admin is what makes a future mismatch debuggable.
    const header = basicAuthHeader({ userLogin: 'u', password: APP_PASSWORD });
    const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8');
    expect(decoded).toBe(`u:${APP_PASSWORD}`);
  });

  it('encodes a non-ASCII login without mangling it', () => {
    const header = basicAuthHeader({ userLogin: 'josé', password: 'x' });
    const expected = 'Basic ' + Buffer.from('josé:x', 'utf8').toString('base64');
    expect(header).toBe(expected);
  });
});
