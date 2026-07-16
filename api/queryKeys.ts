/**
 * Every React Query key starts with a module id. From commit 1, not retrofitted.
 *
 * ARCHITECTURE.md "State & data": a module-id-first key buys per-module invalidation and
 * eviction in one line — `queryClient.removeQueries({ queryKey: [moduleId] })` on
 * unmount or site switch clears exactly that module's cache and nothing else. Retrofitting
 * that prefix across a shipped app is brutal, and skipping the eviction is not hygiene but
 * a correctness bug: a site that disables Listora still renders a Listings panel from
 * persisted cache if that cache cannot be found and dropped by module.
 *
 * This helper exists so the prefix is not a convention every call site has to remember and
 * one eventually forgets. A key built any other way is a key the eviction cannot see.
 */

/** A key segment. Objects (filter bags) are allowed and compared structurally by RQ. */
export type KeySegment = string | number | boolean | Record<string, unknown>;

/**
 * The root key for a module. `moduleKey('core')` is what an eviction targets to drop the
 * whole module.
 */
export function moduleKey(moduleId: string): readonly [string];

/**
 * A specific key within a module: `moduleKey('core', 'feed', { filter })` ->
 * `['core', 'feed', { filter }]`.
 */
export function moduleKey(
  moduleId: string,
  ...segments: KeySegment[]
): readonly [string, ...KeySegment[]];

export function moduleKey(moduleId: string, ...segments: KeySegment[]): readonly unknown[] {
  if (!moduleId) {
    // An empty module id would produce a key indistinguishable from another module's and
    // uninvalidatable by module. Fail loudly at the call site rather than ship a key that
    // silently escapes eviction.
    throw new Error('moduleKey requires a non-empty module id — it is the eviction handle.');
  }
  return [moduleId, ...segments];
}

/**
 * A namespaced key factory bound to one module. A module holds `const key = keysFor('core')`
 * and calls `key('feed', { filter })` — so it cannot accidentally build a key under
 * another module's id, and the prefix is supplied once rather than at every call.
 */
export function keysFor(moduleId: string) {
  return (...segments: KeySegment[]): readonly [string, ...KeySegment[]] =>
    moduleKey(moduleId, ...segments) as readonly [string, ...KeySegment[]];
}
