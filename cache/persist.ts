/**
 * Persistence policy for the React Query cache — the three rules from ARCHITECTURE.md,
 * as pure functions the app wires into PersistQueryClientProvider.
 *
 *   1. KEY BY SITE. `bn-rq-<site hash>` + queryClient.clear() on switch, so site A's cache
 *      never restores under site B.
 *   2. BUST ON version/contract change, so a schema change to what a query returns does
 *      not restore an incompatible shape into the new code.
 *   3. DO NOT PERSIST app-config or viewer-state, and CAP infinite lists to page 1.
 *
 * The reasons are correctness, not housekeeping. A restored app-config would be the
 * licensing hole 0.14 exists to prevent (so it is never in React Query at all). Restored
 * viewer-state (my_reaction, is_bookmarked) is per-viewer truth that goes stale the moment
 * the app is closed; showing yesterday's reaction state is worse than a blank that fills in.
 * And restoring 40 pages of a 2000-item feed on cold start is slow and stale — page 1 is
 * what the member sees; the rest re-fetches on scroll.
 */

import { queryCacheKey } from '../api/siteKey';

/** The AsyncStorage key for a site's persisted cache. */
export function persistKey(siteUrl: string): string {
  return queryCacheKey(siteUrl);
}

/**
 * The cache buster. Any change to it discards the persisted cache on the next load.
 *
 * appVersion catches a shipped code change to how a query is shaped; contract_version
 * catches a server-side change to the payload. Either moving means "the old cache may not
 * match the new code" — throw it out rather than deserialize a stale shape.
 */
export function persistBuster(appVersion: string, contractVersion: number): string {
  return `${appVersion}:${contractVersion}`;
}

/**
 * Should this query be written to disk?
 *
 * Excludes viewer-state (any module's) — per-viewer truth that is stale the instant the
 * app closes. app-config never reaches React Query, so it cannot appear here; the check is
 * on viewer-state, which does. Everything else persists.
 *
 * The key convention is module-first (0.17): ['<module>', '<resource>', ...]. Viewer-state
 * lives at resource 'viewer-state' under any module, so match position 1.
 */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[1] !== 'viewer-state';
}

/** The minimal shape the cap transform reads — the structural floor, no index signatures. */
interface CappableQuery {
  queryKey: readonly unknown[];
  state: { data?: unknown };
}
interface CappableState {
  queries: readonly CappableQuery[];
}

interface InfiniteData {
  pages: unknown[];
  pageParams: unknown[];
}

function isInfiniteData(data: unknown): data is InfiniteData {
  return (
    !!data &&
    typeof data === 'object' &&
    Array.isArray((data as InfiniteData).pages) &&
    Array.isArray((data as InfiniteData).pageParams)
  );
}

/**
 * Cap every persisted infinite query to its first page.
 *
 * Generic over the concrete state type so it accepts and returns EXACTLY React Query's
 * `DehydratedState` — the structural floor above is what it reads, the caller's real type
 * is what it returns. Returns a NEW state; never mutates the live cache's snapshot. A
 * member who has scrolled to page 40 keeps all 40 in memory this session — only the DISK
 * copy is trimmed, so the next cold start restores one page and re-fetches the rest.
 */
export function capToFirstPage<S extends CappableState>(state: S): S {
  return {
    ...state,
    queries: state.queries.map((query) => {
      const data = query.state.data;
      if (!isInfiniteData(data)) {
        return query;
      }
      return {
        ...query,
        state: {
          ...query.state,
          data: {
            ...data,
            pages: data.pages.slice(0, 1),
            pageParams: data.pageParams.slice(0, 1),
          },
        },
      };
    }),
  } as S;
}
