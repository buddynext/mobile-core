/**
 * moduleKey / keysFor — the module-id-first rule, enforced rather than remembered.
 */

import { keysFor, moduleKey } from './queryKeys';

describe('moduleKey', () => {
  it('makes the module id the first segment', () => {
    expect(moduleKey('core', 'feed', { filter: 'all' })).toEqual(['core', 'feed', { filter: 'all' }]);
  });

  it('returns a bare root key for eviction targeting', () => {
    // This is what removeQueries({ queryKey: ['core'] }) matches — the whole module.
    expect(moduleKey('core')).toEqual(['core']);
  });

  it('preserves segment order and types', () => {
    expect(moduleKey('listora', 'listings', 5, true, { q: 'x' })).toEqual([
      'listora',
      'listings',
      5,
      true,
      { q: 'x' },
    ]);
  });

  it('rejects an empty module id — an uninvalidatable key is worse than a crash', () => {
    expect(() => moduleKey('')).toThrow(/non-empty module id/);
  });
});

describe('keysFor — a module cannot key under another module', () => {
  it('binds the prefix once', () => {
    const key = keysFor('core');
    expect(key('feed')).toEqual(['core', 'feed']);
    expect(key('viewer-state')).toEqual(['core', 'viewer-state']);
  });

  it('produces keys an eviction on the module root would match', () => {
    // The contract that makes teardown one line: every key a module builds shares its
    // root, so removeQueries(['listora']) drops all of them.
    const key = keysFor('listora');
    const built = [key('listings', { q: 'a' }), key('listing', 5), key('categories')];

    expect(built.every((k) => k[0] === 'listora')).toBe(true);
  });
});
