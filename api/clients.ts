/**
 * The namespace client registry — one Authorization source, N base URLs.
 *
 * ARCHITECTURE.md "Networking". Every REST namespace the app talks to
 * (`buddynext/v1`, `buddynext-pro/v1`, `mvs/v1`, `mvs-pro/v1`, `jetonomy/v1`, ...) gets
 * its own axios instance with its own base URL, but they all read the SAME credential,
 * and they read it at REQUEST time.
 *
 * WHY REQUEST-TIME AUTH IS THE WHOLE POINT. If the Authorization header were baked into
 * the instance at construction, a sign-in (or a site switch, or a credential refresh)
 * mid-session would apply only to clients built afterwards — every already-created client
 * would keep sending the old header, or none. Reading the credential inside a request
 * interceptor means the NEXT call on every existing instance picks up the new credential
 * with nothing rebuilt. The shipped apps that baked it in had to tear down and recreate
 * their client on every auth change; this does not.
 *
 * ONE REGISTRY PER SITE. The base URL is fixed for an instance's life, so a site switch
 * gets a fresh registry rather than a mutated one — matching "queryClient.clear() on
 * switch" and the module-reset teardown. The credential, which DOES change within a
 * site's session, is the only thing read late.
 */

import axios, { type AxiosInstance } from 'axios';

import { normalizeSiteUrl } from './siteKey';

/**
 * Reads the current Application Password header, or null when signed out.
 *
 * Returns the FULL header value — `Basic base64(user:app_password)` — not the raw
 * credential. Assembling it is the auth layer's job (it owns the base64 and the
 * space-to-plus decoding); this registry only decides whether and when to attach it, and
 * never sees the password itself.
 */
export type AuthHeaderSource = () => string | null;

export interface ClientRegistry {
  /** The axios instance for `namespace`, memoised. Same namespace -> same instance. */
  getClient(namespace: string): AxiosInstance;
  /** The site this registry talks to, normalised. */
  readonly siteUrl: string;
}

export interface ClientRegistryOptions {
  siteUrl: string;
  /** Read at REQUEST time on every call. Never captured at build time. */
  getAuthHeader: AuthHeaderSource;
  /**
   * Per-request timeout in ms. A mobile network stalls; a request with no ceiling hangs a
   * screen's loading state forever. Defaults to 20s.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** `${site}/wp-json/${namespace}` with exactly one slash at each seam. */
function baseUrlFor(normalizedSite: string, namespace: string): string {
  const ns = namespace.replace(/^\/+|\/+$/g, '');
  return `${normalizedSite}/wp-json/${ns}`;
}

export function createClientRegistry({
  siteUrl,
  getAuthHeader,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ClientRegistryOptions): ClientRegistry {
  const normalizedSite = normalizeSiteUrl(siteUrl);
  const cache = new Map<string, AxiosInstance>();

  const build = (namespace: string): AxiosInstance => {
    const instance = axios.create({
      baseURL: baseUrlFor(normalizedSite, namespace),
      timeout: timeoutMs,
      headers: { Accept: 'application/json' },
    });

    instance.interceptors.request.use((config) => {
      // The late read. Evaluated now, on this request, not when the instance was made.
      const header = getAuthHeader();
      if (header) {
        config.headers.set('Authorization', header);
      } else {
        // Signed out, or a public call. Make sure a header left over from a prior
        // interceptor pass cannot linger — every request re-decides from scratch.
        config.headers.delete('Authorization');
      }
      return config;
    });

    return instance;
  };

  return {
    siteUrl: normalizedSite,
    getClient(namespace: string): AxiosInstance {
      const existing = cache.get(namespace);
      if (existing) {
        return existing;
      }
      const created = build(namespace);
      cache.set(namespace, created);
      return created;
    },
  };
}
