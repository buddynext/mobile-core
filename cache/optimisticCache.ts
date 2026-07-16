/**
 * Patch an entity everywhere it is cached.
 *
 * The bug this cures is not about any one feature. An action changes one entity, the
 * change lands only in the screen that fired it, and every other cached screen showing
 * that same entity keeps a stale copy — so the same post disagrees with itself
 * depending on how you navigated to it. Mediaverse's `patchEntityEverywhere` is the
 * shipped cure and the right idea.
 *
 * It is also, as shipped, load-bearing AND wrong in three ways. This is a rewrite, not
 * a port. What it keeps: walk every cached shape, return new references so React Query
 * re-renders, never mutate, hand back a rollback.
 *
 * WHAT CHANGED, AND WHY EACH ONE IS A REAL BUG:
 *
 * 1. KEY ON (type, id), NOT id.
 *    `isEntity` matched `record.id === id`. Post 5, user 5, comment 5, space 5 and
 *    media 5 are all "5". Mediaverse survived on two entity types and additive fields;
 *    BuddyNext has ten across seven plugins. Following user 5 would stamp
 *    `is_following: true` onto post 5 and space 5. Any counter mutation (`count + 1`)
 *    does not just look wrong, it corrupts the number.
 *
 * 2. SCOPE THE WALK.
 *    `qc.setQueriesData({})` is O(everything cached) per tap, and the shipped rollback
 *    snapshot called `getQueriesData({})` — so every reaction walked every page of every
 *    cached list TWICE. At a 2000-item feed that is the whole cache, on every tap.
 *
 * 3. SNAPSHOT ONLY WHAT YOU TOUCH.
 *    Not in the doc; found reading the source. The shipped rollback snapshots EVERY
 *    query and restores EVERY query. So it reverts data that arrived after onMutate and
 *    had nothing to do with the mutation, and two overlapping optimistic updates clobber
 *    each other — the second's rollback restores a snapshot taken before the first even
 *    ran. Here the snapshot covers only the queries actually patched.
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { isRef, scopeFor, type EntityRef } from './entities';

/**
 * Apply `fn` to every record matching `ref` inside ONE cached value, whatever its shape:
 * a bare entity, an array, or an infinite query's `{ pages: [{ items }] }`.
 *
 * Returns a new reference only when something actually changed. That is not a
 * micro-optimisation — React Query re-renders on identity change, so returning a fresh
 * object for an untouched cache re-renders a screen that did not change, and at feed
 * scale that is most of them.
 *
 * Exported for its own tests: this is where the shape handling lives, and it is pure.
 */
export function patchInData<T>(data: unknown, ref: EntityRef, fn: (entity: T) => T): unknown {
  if (!data) {
    return data;
  }

  // The entity itself — a detail screen's cache.
  if (isRef(data, ref)) {
    return fn(data as T);
  }

  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((element) => {
      if (!isRef(element, ref)) {
        return element;
      }
      changed = true;
      return fn(element as T);
    });
    return changed ? next : data;
  }

  const paged = data as { pages?: Array<{ items?: unknown[] }> };
  if (Array.isArray(paged.pages)) {
    let anyChanged = false;
    const pages = paged.pages.map((page) => {
      if (!Array.isArray(page.items)) {
        return page;
      }
      let changed = false;
      const items = page.items.map((element) => {
        if (!isRef(element, ref)) {
          return element;
        }
        changed = true;
        anyChanged = true;
        return fn(element as T);
      });
      return changed ? { ...page, items } : page;
    });
    return anyChanged ? { ...paged, pages } : data;
  }

  return data;
}

/**
 * Undo a patch. Restores only the queries that were touched.
 *
 * DO NOT CALL THIS ON A CONVERGENT ERROR. UX.md §9: a 404 on a delete or a 409 on a
 * report means the world already agrees with you — rolling back would put the deleted
 * post back on screen and tell the member their action failed when it succeeded. Roll
 * back on genuine failures only.
 */
export type Rollback = () => void;

/**
 * Patch `ref` across every cached query that could hold it, and return a rollback.
 *
 * Usage inside a mutation:
 *   onMutate: () => ({ rollback: patchEntityEverywhere(qc, { type: 'user', id }, (u) => ({ ...u, is_following: true })) })
 *   onError:  (err, _v, ctx) => { if (!isConvergent(err)) ctx?.rollback(); }
 */
export function patchEntityEverywhere<T>(
  qc: QueryClient,
  ref: EntityRef,
  fn: (entity: T) => T
): Rollback {
  const scope = scopeFor(ref.type);
  const predicate = (query: { queryKey: QueryKey }) => scope(query.queryKey);

  // Snapshot BEFORE patching, and only within scope. `getQueriesData` returns the live
  // references; we are about to replace them with new ones rather than mutate them, so
  // holding the old reference is a valid snapshot.
  const snapshot = qc.getQueriesData({ predicate });

  const touched: QueryKey[] = [];
  for (const [key, data] of snapshot) {
    const next = patchInData<T>(data, ref, fn);
    if (next !== data) {
      qc.setQueryData(key, next);
      touched.push(key);
    }
  }

  // Restore only what we changed. A query that this patch did not touch must not be
  // rewound — something else may legitimately own it by now.
  const restore = new Map<QueryKey, unknown>();
  for (const [key, data] of snapshot) {
    if (touched.some((t) => t === key)) {
      restore.set(key, data);
    }
  }

  return () => {
    for (const [key, data] of restore) {
      qc.setQueryData(key, data);
    }
  };
}
