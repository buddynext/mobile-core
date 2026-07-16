/**
 * Persistence policy.
 *
 * Each test pins a rule whose violation is a correctness bug, not a size regression:
 * viewer-state restoring stale reaction flags, a version change restoring an incompatible
 * shape, page 40 of a feed restoring on cold start, or one site's cache keyed where another
 * would read it.
 */

import {
  capToFirstPage,
  persistBuster,
  persistKey,
  shouldPersistQuery,
} from './persist';

describe('persistKey', () => {
  it('keys by site so two sites never share a bucket', () => {
    expect(persistKey('https://a.com')).not.toBe(persistKey('https://b.com'));
  });

  it('is stable across cosmetic URL differences (same site, same key)', () => {
    expect(persistKey('https://Site.com/')).toBe(persistKey('https://site.com'));
  });

  it('is a bn-rq- bucket', () => {
    expect(persistKey('https://site.com')).toMatch(/^bn-rq-[0-9a-f]{32}$/);
  });
});

describe('persistBuster', () => {
  it('changes when the app version changes', () => {
    expect(persistBuster('1.0.0', 1)).not.toBe(persistBuster('1.1.0', 1));
  });

  it('changes when the contract version changes', () => {
    expect(persistBuster('1.0.0', 1)).not.toBe(persistBuster('1.0.0', 2));
  });

  it('is stable when nothing changed', () => {
    expect(persistBuster('1.0.0', 1)).toBe(persistBuster('1.0.0', 1));
  });
});

describe('shouldPersistQuery', () => {
  it('persists ordinary lists and details', () => {
    expect(shouldPersistQuery(['core', 'feed', { filter: 'all' }])).toBe(true);
    expect(shouldPersistQuery(['core', 'post', 5])).toBe(true);
    expect(shouldPersistQuery(['listora', 'listings'])).toBe(true);
  });

  it('never persists viewer-state — it is stale the instant the app closes', () => {
    expect(shouldPersistQuery(['core', 'viewer-state'])).toBe(false);
    expect(shouldPersistQuery(['core', 'viewer-state', { ids: [1, 2] }])).toBe(false);
  });

  it('excludes viewer-state under ANY module, not just core', () => {
    expect(shouldPersistQuery(['mediaverse', 'viewer-state'])).toBe(false);
  });
});

describe('capToFirstPage', () => {
  const infiniteQuery = (pages: number) => ({
    queryKey: ['core', 'feed'],
    state: {
      data: {
        pages: Array.from({ length: pages }, (_, i) => ({ items: [`page-${i}`] })),
        pageParams: Array.from({ length: pages }, (_, i) => i + 1),
      },
      status: 'success',
    },
  });

  it('trims a many-page infinite query to page 1', () => {
    const capped = capToFirstPage({ queries: [infiniteQuery(40)] });
    const data = capped.queries[0]!.state.data as { pages: unknown[]; pageParams: unknown[] };

    expect(data.pages).toHaveLength(1);
    expect(data.pageParams).toHaveLength(1);
    expect(data.pages[0]).toEqual({ items: ['page-0'] });
  });

  it('leaves a non-infinite query untouched', () => {
    const detail = { queryKey: ['core', 'post', 5], state: { data: { id: 5, title: 'x' } } };
    const capped = capToFirstPage({ queries: [detail] });
    expect(capped.queries[0]!.state.data).toEqual({ id: 5, title: 'x' });
  });

  it('does not mutate the input (the live cache snapshot must be untouched)', () => {
    // The member has scrolled to page 40 this session; only the DISK copy is trimmed.
    const input = { queries: [infiniteQuery(40)] };
    capToFirstPage(input);
    const data = input.queries[0]!.state.data as { pages: unknown[] };
    expect(data.pages).toHaveLength(40);
  });

  it('handles an empty or single-page query gracefully', () => {
    expect(capToFirstPage({ queries: [] }).queries).toEqual([]);
    const single = capToFirstPage({ queries: [infiniteQuery(1)] });
    expect((single.queries[0]!.state.data as { pages: unknown[] }).pages).toHaveLength(1);
  });
});
