/**
 * Entity identity, and where entities live in the cache.
 *
 * Two separate problems, deliberately kept separate because conflating them is what
 * broke the shipped version:
 *
 *   IDENTITY (correctness) — is this cached record the thing I am patching?
 *   SCOPE    (performance) — which cached queries could possibly hold it?
 *
 * The shipped `optimisticCache` answered the first with `record.id === id` and the
 * second with "all of them". Both are fixed here, independently.
 */

import type { QueryKey } from '@tanstack/react-query';

/**
 * Every entity type the app can cache. Ten across seven plugins — which is exactly why
 * an id alone cannot identify one.
 */
export type EntityType =
  | 'post'
  | 'comment'
  | 'user'
  | 'space'
  | 'conversation'
  | 'message'
  | 'notification'
  | 'forum_topic'
  | 'forum_reply'
  | 'media'
  | 'job'
  | 'course'
  | 'listing';

/** A specific entity: type AND id. Neither half identifies it alone. */
export interface EntityRef {
  type: EntityType;
  id: number;
}

/**
 * The marker every cached record carries so the walk can tell what it is.
 *
 * WHY A MARKER AND NOT STRUCTURAL SNIFFING:
 *
 * There is no honest way to look at `{ id: 5, ... }` and know whether it is a post or a
 * user. Guessing from fields ("it has `content`, so it's a post") breaks the first time
 * two entities share a field, silently, in production.
 *
 * WHY NOT REUSE `type`:
 *
 * `post.type` ALREADY EXISTS and means something else — it is the content type
 * (`text` | `photo` | `poll`), straight from `bn_posts.type`. A walk matching
 * `record.type === 'post'` would never match a single post, and worse, would match
 * nothing while appearing to work. `__entity` is a separate namespace precisely so it
 * cannot collide with a server field.
 *
 * The API client stamps this at the boundary (TG0.12), so every record is tagged once,
 * on arrival, rather than at each of the call sites that might patch it.
 */
export interface Tagged {
  __entity: EntityType;
  id: number;
}

/** Tag a record on its way in from the API. */
export function tag<T extends { id: number }>(type: EntityType, record: T): T & Tagged {
  return { ...record, __entity: type };
}

/**
 * Does this cached value identify as `ref`?
 *
 * An untagged record NEVER matches. That is the safe direction: failing to patch is a
 * stale screen the next refetch fixes, while patching the wrong entity writes bad data
 * — and with a counter mutation (`count + 1`), corrupts it outright.
 */
export function isRef(value: unknown, ref: EntityRef): value is Tagged {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Tagged>;
  return candidate.__entity === ref.type && candidate.id === ref.id;
}

/**
 * Which cached queries can hold this entity type.
 *
 * `qc.setQueriesData({})` is O(everything cached) PER TAP. With a 2000-item infinite
 * feed, every reaction walks every page of every list — and the shipped version did it
 * twice, since the rollback snapshot walked everything too.
 *
 * Scopes are REGISTERED BY MODULES rather than hardcoded here, because mobile-core does
 * not know that jetonomy keeps topics under `['jetonomy', 'topics']`. A core that knew
 * every module's key layout would be a core that every new module has to edit — the
 * exact coupling the package boundary exists to prevent.
 */
export type KeyScope = (key: QueryKey) => boolean;

const scopes = new Map<EntityType, KeyScope[]>();

/**
 * Declare that queries matching `scope` may contain entities of `type`.
 *
 * Additive: several modules can each contribute a scope for the same type. A user
 * appears in core's member list AND as a message author in mediaverse's threads, and
 * neither module should need to know about the other.
 */
export function registerEntityScope(type: EntityType, scope: KeyScope): void {
  const existing = scopes.get(type);
  if (existing) {
    existing.push(scope);
    return;
  }
  scopes.set(type, [scope]);
}

/**
 * The predicate for one entity type: true when ANY registered scope claims the key.
 *
 * An UNREGISTERED type matches NOTHING, deliberately — and this is the one place the
 * safe default is debatable, so it is worth stating. Matching everything would restore
 * the O(everything) walk we are here to remove, and would do it invisibly. Matching
 * nothing makes a missing registration show up as "my optimistic update does nothing",
 * which is annoying, local, and obvious. A silent performance cliff is neither.
 */
export function scopeFor(type: EntityType): KeyScope {
  const registered = scopes.get(type);
  if (!registered || registered.length === 0) {
    return () => false;
  }
  return (key: QueryKey) => registered.some((scope) => scope(key));
}

/** Test seam. Modules register at mount; a test must be able to start clean. */
export function resetEntityScopes(): void {
  scopes.clear();
}
