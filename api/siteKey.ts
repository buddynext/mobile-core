/**
 * A stable, collision-resistant, storage-safe key for one connected site.
 *
 * This is the join column for everything per-site: the SecureStore row holding the
 * Application Password, the persisted React Query cache (`bn-rq-<key>`), the client
 * registry's memo table. Two URLs that mean the same site MUST produce the same key, and
 * two different sites MUST NOT — the first would strand a member's credential, the second
 * would hand site A's cache (or worse, cache key) to site B.
 *
 * WHY A NEW HASH (0.11). The shipped apps keyed on a 32-bit hash and it collided in the
 * wild. A collision here is a 401, not a breach — the wrong credential simply fails
 * auth — but a HOST talks to many more sites than a single-brand app ever did, so the
 * birthday math that was tolerable for one white-label build is not tolerable here. This
 * uses a 128-bit hash (cyrb128), whose collision probability across the low thousands of
 * sites a device could ever connect to is negligible.
 *
 * Non-cryptographic ON PURPOSE. The requirement is even distribution, not
 * unforgeability — nobody gains anything by forging a local storage key, and a real
 * SHA-256 would have to be async (expo-crypto), which a synchronous key lookup on every
 * request cannot be.
 */

/**
 * Canonicalise a site URL so cosmetically-different spellings of the same site collapse
 * to one key, while genuinely different installs stay distinct.
 *
 * The hard part is the second half. `site.com/community` and `site.com/shop` are two
 * separate WordPress installs on a subdirectory multisite — the PATH is load-bearing and
 * must be kept. So this normalises only what is provably cosmetic: scheme+host case, the
 * default port, and a trailing slash. It does not touch the path beyond stripping that
 * one trailing slash.
 */
export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a parseable URL. Return a trimmed, lowercased form so two spellings of the
    // same junk still hash alike — the client layer rejects a non-URL long before this
    // key is used to talk to anything.
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }

  // Host and scheme are case-insensitive per RFC 3986; the path is NOT.
  const scheme = url.protocol.toLowerCase();
  const host = url.hostname.toLowerCase();

  // Drop the port only when it is the scheme's default — :443 on https is the same
  // endpoint as no port, but :8080 is a different server.
  const isDefaultPort =
    url.port === '' ||
    (scheme === 'https:' && url.port === '443') ||
    (scheme === 'http:' && url.port === '80');
  const authority = isDefaultPort ? host : `${host}:${url.port}`;

  // Keep the path (multisite installs live on it); strip only a single trailing slash so
  // ".../community" and ".../community/" agree. Query and fragment are never part of a
  // site's identity.
  const path = url.pathname.replace(/\/+$/, '');

  return `${scheme}//${authority}${path}`;
}

/**
 * cyrb128 — a well-distributed 128-bit non-cryptographic hash.
 *
 * Four independent 32-bit lanes mixed together; returned as a fixed 32-char lowercase hex
 * string. Public domain, widely used, and specifically chosen over a single 32-bit lane
 * because four lanes are what push the collision space from "possible in the wild" to
 * "not going to happen".
 */
function cyrb128(input: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;

  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

const toHex8 = (n: number): string => n.toString(16).padStart(8, '0');

/**
 * The site key: normalise, then hash to 32 hex chars.
 *
 * The output is `[0-9a-f]{32}` — inside SecureStore's allowed set (alphanumerics plus
 * `.`, `-`, `_`) by construction, so no caller has to sanitise it, and it can never
 * produce a key SecureStore rejects at write time.
 */
export function siteKey(siteUrl: string): string {
  const [a, b, c, d] = cyrb128(normalizeSiteUrl(siteUrl));
  return toHex8(a) + toHex8(b) + toHex8(c) + toHex8(d);
}

/** SecureStore row holding this site's Application Password. */
export function credentialKey(siteUrl: string): string {
  return `bn.cred.${siteKey(siteUrl)}`;
}

/** Persisted React Query cache bucket for this site (0.18 keys the persister with this). */
export function queryCacheKey(siteUrl: string): string {
  return `bn-rq-${siteKey(siteUrl)}`;
}

/** SecureStore's permitted key charset, exported so a test can assert against it. */
export const SECURE_STORE_KEY = /^[A-Za-z0-9._-]+$/;
