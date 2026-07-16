/**
 * siteKey — the per-site join column.
 *
 * Two failure modes, opposite and both bad, so both are tested hard:
 *   - two spellings of the SAME site producing DIFFERENT keys -> a member's stored
 *     credential is stranded and they are asked to sign in again for a site they already
 *     added.
 *   - two DIFFERENT sites producing the SAME key -> site B reads site A's cache bucket.
 *
 * Plus the storage-safety invariant: the key must always be a legal SecureStore key, or
 * the write throws at runtime on exactly the site whose URL happened to contain a bad
 * character.
 */

import {
  SECURE_STORE_KEY,
  credentialKey,
  normalizeSiteUrl,
  queryCacheKey,
  siteKey,
} from './siteKey';

describe('the same site collapses to one key', () => {
  it.each([
    ['https://site.com', 'https://site.com/'],
    ['https://site.com', 'https://SITE.com'],
    ['https://site.com', 'HTTPS://site.com'],
    ['https://site.com', 'https://site.com:443'],
    ['http://site.com', 'http://site.com:80'],
    ['https://site.com', '  https://site.com  '],
    ['https://site.com/community', 'https://site.com/community/'],
  ])('%s and %s share a key', (a, b) => {
    expect(siteKey(a)).toBe(siteKey(b));
  });
});

describe('different sites never share a key', () => {
  it.each([
    ['https://site.com', 'http://site.com'], // scheme differs — a downgrade is a different endpoint
    ['https://site.com', 'https://www.site.com'], // host differs
    ['https://site.com', 'https://site.com:8080'], // non-default port is a different server
    ['https://site.com/community', 'https://site.com/shop'], // subdirectory multisite — path is load-bearing
    ['https://site.com/community', 'https://site.com'], // install on a path vs at the root
    ['https://a.com', 'https://b.com'],
  ])('%s and %s differ', (a, b) => {
    expect(siteKey(a)).not.toBe(siteKey(b));
  });
});

describe('the key is always storage-safe', () => {
  it('is 32 lowercase hex chars', () => {
    expect(siteKey('https://site.com')).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each([
    'https://site.com/path with spaces',
    'https://sïte.com',
    'https://site.com/@handle',
    'not a url at all',
    'https://site.com/a/b?q=1#frag',
    '',
  ])('produces a SecureStore-legal key even for %j', (url) => {
    expect(siteKey(url)).toMatch(SECURE_STORE_KEY);
    expect(credentialKey(url)).toMatch(SECURE_STORE_KEY);
    expect(queryCacheKey(url)).toMatch(SECURE_STORE_KEY);
  });
});

describe('derived keys are namespaced and distinct', () => {
  it('keeps the credential key and the cache key apart for one site', () => {
    // Same site, two purposes. They must not collide, or clearing the cache could touch
    // the credential row.
    const url = 'https://site.com';
    expect(credentialKey(url)).not.toBe(queryCacheKey(url));
  });

  it('carries the site key inside each derived key', () => {
    const key = siteKey('https://site.com');
    expect(credentialKey('https://site.com')).toContain(key);
    expect(queryCacheKey('https://site.com')).toContain(key);
  });
});

describe('normalizeSiteUrl keeps the path but drops the cosmetic', () => {
  it.each([
    ['https://Site.com/', 'https://site.com'],
    ['https://site.com:443/community/', 'https://site.com/community'],
    ['http://site.com:80', 'http://site.com'],
    ['https://site.com/a/b/', 'https://site.com/a/b'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
  });

  it('does not merge a subdirectory install into the root', () => {
    expect(normalizeSiteUrl('https://site.com/community')).not.toBe(
      normalizeSiteUrl('https://site.com')
    );
  });

  it('preserves path case — a case-sensitive server makes /Community and /community distinct', () => {
    // Host and scheme are case-insensitive per RFC 3986 and safe to lowercase; the PATH is
    // not, and many servers serve /Community and /community as two different installs.
    // Lowercasing the path would merge them into one key and hand one install's credential
    // to the other. Scheme+host case is still folded.
    expect(normalizeSiteUrl('https://site.com/Community')).not.toBe(
      normalizeSiteUrl('https://site.com/community')
    );
    expect(normalizeSiteUrl('https://SITE.com/Community')).toBe(
      normalizeSiteUrl('https://site.com/Community')
    );
  });
});

describe('distribution — the reason for 128 bits', () => {
  it('gives 4000 realistic site URLs 4000 distinct keys', () => {
    // Not a proof of collision resistance, but a smoke test that the hash actually
    // spreads. A weak 32-bit hash (the shipped one) collides in a set this size; a broken
    // 128-bit implementation that drops lanes would too.
    const keys = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      keys.add(siteKey(`https://community-${i}.example.org/wp`));
      keys.add(siteKey(`https://tenant${i}.myhost.io`));
    }
    expect(keys.size).toBe(8000);
  });

  it('separates URLs that differ in a single character', () => {
    // Avalanche: a one-char change must not leave the key mostly the same, or clustered
    // inputs (site-1, site-2, ...) would cluster in the key space.
    expect(siteKey('https://site1.com')).not.toBe(siteKey('https://site2.com'));
    expect(siteKey('https://siteA.com')).not.toBe(siteKey('https://siteB.com'));
  });

  it('uses four INDEPENDENT hash lanes, not one repeated', () => {
    // The 128-bit key is four 32-bit hex groups. A hash that collapsed to a single lane
    // (repeated four times) would still pass the 8000-distinct-keys test above — 32 bits
    // easily separates 8000 inputs — yet it would carry only 32 bits of collision
    // resistance, which is exactly the shipped bug. The four groups differing is the
    // structural proof that all 128 bits are live.
    for (const url of ['https://site.com', 'https://a.example.org/wp', 'https://tenant.io']) {
      const key = siteKey(url);
      const lanes = [
        key.slice(0, 8),
        key.slice(8, 16),
        key.slice(16, 24),
        key.slice(24, 32),
      ];
      expect(new Set(lanes).size).toBe(4);
    }
  });
});
