/**
 * optimisticCache — against a REAL QueryClient.
 *
 * A hand-rolled fake cache would prove that my fake behaves how I imagined React Query
 * behaves. The whole bug class here lives in the seam between our walk and the
 * library's filtering/identity rules, which is precisely what a fake cannot model.
 *
 * The first describe block is the point of this file: the two bugs the shipped
 * `patchEntityEverywhere` has today, written as tests that FAIL against it and pass
 * here. Everything else guards the rewrite.
 */

import { QueryClient } from '@tanstack/react-query';

import { patchEntityEverywhere, patchInData } from './optimisticCache';
import { registerEntityScope, resetEntityScopes, tag, type EntityRef } from './entities';

interface Post {
  id: number;
  __entity: 'post';
  content: string;
  like_count: number;
  is_following?: boolean;
}

interface User {
  id: number;
  __entity: 'user';
  name: string;
  is_following: boolean;
}

const post = (id: number, over: Partial<Post> = {}): Post =>
  tag('post', { id, content: `post ${id}`, like_count: 0, ...over }) as Post;

const user = (id: number, over: Partial<User> = {}): User =>
  tag('user', { id, name: `user ${id}`, is_following: false, ...over }) as User;

const FEED: EntityRef = { type: 'post', id: 5 };

let qc: QueryClient;

beforeEach(() => {
  resetEntityScopes();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // What module-core would register at mount.
  registerEntityScope('post', (key) => key[0] === 'core' && key[1] === 'feed');
  registerEntityScope('post', (key) => key[0] === 'core' && key[1] === 'post');
  registerEntityScope('user', (key) => key[0] === 'core' && key[1] === 'members');
  registerEntityScope('user', (key) => key[0] === 'core' && key[1] === 'feed');
});

afterEach(() => {
  qc.clear();
});

describe('the two bugs the shipped version has', () => {
  it('does not stamp user 5\'s change onto post 5 (the id-collision bug)', () => {
    // THE bug. The shipped isEntity matches `record.id === id`, so following user 5
    // writes is_following onto post 5 and space 5 too. Ten entity types across seven
    // plugins means "5" is five different things.
    qc.setQueryData(['core', 'feed'], [post(5), post(6)]);
    qc.setQueryData(['core', 'members'], [user(5), user(6)]);

    patchEntityEverywhere<User>(qc, { type: 'user', id: 5 }, (u) => ({
      ...u,
      is_following: true,
    }));

    const members = qc.getQueryData<User[]>(['core', 'members'])!;
    const feed = qc.getQueryData<Post[]>(['core', 'feed'])!;

    expect(members[0]!.is_following).toBe(true);
    expect(feed[0]!.id).toBe(5);
    expect(feed[0]!).not.toHaveProperty('is_following');
  });

  it('does not corrupt a counter on a same-id entity of another type', () => {
    // The version of the collision that destroys data rather than just looking wrong:
    // an additive field is recoverable on refetch, a wrong count is a wrong count.
    qc.setQueryData(['core', 'feed'], [post(5, { like_count: 10 })]);
    qc.setQueryData(['core', 'members'], [user(5)]);

    patchEntityEverywhere<{ id: number; like_count: number }>(
      qc,
      { type: 'user', id: 5 },
      (u) => ({ ...u, like_count: (u.like_count ?? 0) + 1 })
    );

    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]!.like_count).toBe(10);
  });

  it('walks only the queries that can hold the entity (the O(everything) bug)', () => {
    // `setQueriesData({})` per tap walks every page of every cached list. Proven by
    // counting what the walk actually reads rather than by timing it.
    const unrelated = ['mediaverse', 'conversations'];
    qc.setQueryData(['core', 'feed'], [post(5)]);
    qc.setQueryData(unrelated, [{ id: 5, __entity: 'conversation', unread: 3 }]);

    // spyOn, not a Proxy: QueryClient uses private class fields (#defaultOptions), and
    // a Proxy re-binds `this` to itself, so the real client can no longer read them.
    // Spying leaves `this` as the genuine client and still records the call.
    const reads = jest.spyOn(qc, 'getQueriesData');

    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 1 }));

    // Read once, and only the in-scope query came back. The conversation cache — which
    // also holds an id 5 — is never even looked at.
    expect(reads).toHaveBeenCalledTimes(1);
    expect(reads.mock.results[0]!.value).toHaveLength(1);
    expect((reads.mock.results[0]!.value as Array<[unknown, unknown]>)[0]![0]).toEqual([
      'core',
      'feed',
    ]);
    expect(qc.getQueryData(unrelated)).toEqual([{ id: 5, __entity: 'conversation', unread: 3 }]);

    reads.mockRestore();
  });
});

describe('shapes', () => {
  it('patches a bare entity (a detail screen)', () => {
    qc.setQueryData(['core', 'post', 5], post(5));

    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 1 }));

    expect(qc.getQueryData<Post>(['core', 'post', 5])!.like_count).toBe(1);
  });

  it('patches inside an array', () => {
    qc.setQueryData(['core', 'feed'], [post(4), post(5), post(6)]);

    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 1 }));

    const feed = qc.getQueryData<Post[]>(['core', 'feed'])!;
    expect(feed.map((p) => p.like_count)).toEqual([0, 1, 0]);
  });

  it('patches inside an infinite query across pages', () => {
    qc.setQueryData(['core', 'feed'], {
      pageParams: [1, 2],
      pages: [{ items: [post(1), post(5)] }, { items: [post(5), post(9)] }],
    });

    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: p.like_count + 1 }));

    const data = qc.getQueryData<{ pages: Array<{ items: Post[] }> }>(['core', 'feed'])!;
    // The same entity duplicated across pages must converge — a feed that shows post 5
    // twice with different counts is the drift bug in one screen.
    expect(data.pages[0]!.items[1]!.like_count).toBe(1);
    expect(data.pages[1]!.items[0]!.like_count).toBe(1);
    expect(data.pages[0]!.items[0]!.like_count).toBe(0);
  });

  it('survives a cache holding null, undefined and junk', () => {
    qc.setQueryData(['core', 'feed'], null);
    qc.setQueryData(['core', 'post', 1], undefined);
    qc.setQueryData(['core', 'members'], 'not an entity');

    expect(() =>
      patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 1 }))
    ).not.toThrow();
  });
});

describe('identity is preserved when nothing changed', () => {
  it('returns the same reference for an untouched cache', () => {
    // React Query re-renders on identity change. A fresh object for a cache that did not
    // change re-renders a screen for nothing — at feed scale, most of them.
    const data = [post(1), post(2)];

    expect(patchInData(data, FEED, (p: Post) => ({ ...p, like_count: 99 }))).toBe(data);
  });

  it('returns the same reference for an untouched page', () => {
    const untouched = { items: [post(1)] };
    const data = { pages: [untouched, { items: [post(5)] }] };

    const next = patchInData(data, FEED, (p: Post) => ({ ...p, like_count: 1 })) as typeof data;

    expect(next).not.toBe(data);
    expect(next.pages[0]).toBe(untouched);
  });

  it('never mutates the input', () => {
    const original = post(5, { like_count: 0 });
    const data = [original];

    patchInData(data, FEED, (p: Post) => ({ ...p, like_count: 1 }));

    expect(original.like_count).toBe(0);
    expect(data[0]).toBe(original);
  });
});

describe('untagged records are never patched', () => {
  it('ignores a record with no __entity marker', () => {
    // Failing to patch is a stale screen the next refetch fixes. Patching the wrong
    // record writes bad data. When identity is unknown, doing nothing is the safe side.
    qc.setQueryData(['core', 'feed'], [{ id: 5, content: 'untagged' }]);

    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 99 }));

    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]).not.toHaveProperty('like_count');
  });

  it('does not match on `type`, which means content type on a post', () => {
    // `bn_posts.type` is 'text' | 'photo' | 'poll'. A walk keying on `type` would match
    // nothing while looking correct.
    qc.setQueryData(['core', 'feed'], [{ id: 5, type: 'post', content: 'decoy' }]);

    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 99 }));

    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]).not.toHaveProperty('like_count');
  });
});

describe('rollback', () => {
  it('restores what it patched', () => {
    qc.setQueryData(['core', 'feed'], [post(5, { like_count: 3 })]);

    const rollback = patchEntityEverywhere<Post>(qc, FEED, (p) => ({
      ...p,
      like_count: p.like_count + 1,
    }));
    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]!.like_count).toBe(4);

    rollback();

    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]!.like_count).toBe(3);
  });

  it('does NOT rewind an in-scope query it never touched (the third bug)', () => {
    // The shipped rollback restores every query it snapshotted, touched or not. So data
    // that legitimately changed between onMutate and onError — a refetch landing, a
    // page arriving — is silently reverted by an unrelated failure.
    //
    // The query below must be BOTH in scope AND already in the cache at patch time, or
    // the test proves nothing: a query created after the snapshot was never in it, and
    // an out-of-scope query is trivially safe. Verified to fail against the shipped
    // implementation.
    qc.setQueryData(['core', 'feed'], [post(5, { like_count: 0 })]);
    qc.setQueryData(['core', 'post', 7], post(7, { content: 'before' }));

    const rollback = patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 1 }));

    // Post 7's detail screen refetches while the mutation is in flight. Nothing to do
    // with post 5.
    qc.setQueryData(['core', 'post', 7], post(7, { content: 'refetched' }));

    rollback();

    expect(qc.getQueryData<Post>(['core', 'post', 7])!.content).toBe('refetched');
    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]!.like_count).toBe(0);
  });

  it('leaves a fresher value for the SAME query alone is NOT claimed — document the limit', () => {
    // Honesty about a known limit rather than a test that pretends it away.
    //
    // If the same query is patched twice and the FIRST rollback runs, it restores the
    // pre-first snapshot and the second patch is lost. This is the standard React Query
    // snapshot/restore trade-off and it is not solved here: an inverse patch cannot be
    // derived from an arbitrary `fn`.
    //
    // It is survivable because rollback fires on a genuine failure, which is followed by
    // an invalidate/refetch that re-establishes server truth. Pinning the behaviour so a
    // future change to it is a decision, not an accident.
    qc.setQueryData(['core', 'feed'], [post(5, { like_count: 0 })]);

    const first = patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 1 }));
    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 2 }));

    first();

    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]!.like_count).toBe(0);
  });
});

describe('scope registration', () => {
  it('an unregistered entity type patches nothing rather than everything', () => {
    // The safe default is the narrow one. Matching everything would restore the
    // O(everything) walk invisibly; matching nothing surfaces a missing registration as
    // "my update did nothing", which is local and obvious.
    resetEntityScopes();
    qc.setQueryData(['core', 'feed'], [post(5)]);

    patchEntityEverywhere<Post>(qc, FEED, (p) => ({ ...p, like_count: 99 }));

    expect(qc.getQueryData<Post[]>(['core', 'feed'])![0]!.like_count).toBe(0);
  });

  it('is additive — two modules can claim the same entity type', () => {
    // A user is in core's member list AND is a message author in mediaverse's threads.
    // Neither module should have to know the other exists.
    registerEntityScope('user', (key) => key[0] === 'mediaverse' && key[1] === 'thread');
    qc.setQueryData(['core', 'members'], [user(5)]);
    qc.setQueryData(['mediaverse', 'thread', 1], [user(5)]);

    patchEntityEverywhere<User>(qc, { type: 'user', id: 5 }, (u) => ({
      ...u,
      is_following: true,
    }));

    expect(qc.getQueryData<User[]>(['core', 'members'])![0]!.is_following).toBe(true);
    expect(qc.getQueryData<User[]>(['mediaverse', 'thread', 1])![0]!.is_following).toBe(true);
  });
});
