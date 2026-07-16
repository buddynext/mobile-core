/**
 * The one algorithm, at all five call sites.
 *
 * UX.md §2: "One resolver, five call sites. Register a key, get correct behaviour
 * everywhere." So this suite is the contract for the tab bar, profile panels, space
 * tabs, composer actions and settings sections simultaneously. A behaviour that is
 * only right for the tab bar does not belong in this function.
 *
 * The invariants that matter most are the ones about what must NOT happen:
 *   - a server misconfig cannot produce a 12-tab bar (client budget wins)
 *   - a client update cannot reorder the owner's nav (server order wins)
 *   - a tab is never synthesized to fill an empty slot
 *   - a badge never hides behind a chevron
 */

import { resolveContributions, type ServerNavItem } from './resolve';

/** The registry values are opaque to the resolver — a marker object is enough. */
const screen = (id: string) => ({ id });

const registryOf = (...keys: string[]) =>
  new Map(keys.map((k) => [k, screen(k)]));

const item = (
  key: string,
  order: number,
  extra: Partial<ServerNavItem> = {}
): ServerNavItem => ({ key, label: key, order, ...extra });

/** The tab bar's shape, per UX.md §1. */
const TAB_PINS = { lead: ['home'], trail: ['you'] };

describe('join on key', () => {
  it('drops a server item no module claims (plugin newer than app)', () => {
    const { visible } = resolveContributions({
      serverItems: [item('home', 1), item('careerboard', 2)],
      registry: registryOf('home'),
      budget: 5,
    });

    expect(visible.map((v) => v.key)).toEqual(['home']);
  });

  it('drops a registered module the server did not send (flagged off)', () => {
    const { visible } = resolveContributions({
      serverItems: [item('home', 1)],
      registry: registryOf('home', 'spaces'),
      budget: 5,
    });

    expect(visible.map((v) => v.key)).toEqual(['home']);
  });

  it('renders the intersection, and an unclaimed item is not overflow', () => {
    // Dropped is dropped. Putting an unrenderable key in overflow would surface a
    // dead row in You > More that navigates nowhere.
    const { visible, overflow } = resolveContributions({
      serverItems: [item('home', 1), item('careerboard', 2)],
      registry: registryOf('home'),
      budget: 1,
    });

    expect(visible.map((v) => v.key)).toEqual(['home']);
    expect(overflow).toHaveLength(0);
  });
});

describe('order is the server\'s', () => {
  it('sorts by server order, not registry or array order', () => {
    const { visible } = resolveContributions({
      serverItems: [item('c', 30), item('a', 10), item('b', 20)],
      registry: registryOf('b', 'c', 'a'),
      budget: 5,
    });

    expect(visible.map((v) => v.key)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties on key so the order is total and never input-dependent', () => {
    // Same order value from the server must not resolve differently depending on the
    // order the JSON happened to arrive in — that is a nav that shuffles per request.
    const forward = resolveContributions({
      serverItems: [item('alpha', 10), item('beta', 10), item('gamma', 10)],
      registry: registryOf('alpha', 'beta', 'gamma'),
      budget: 5,
    });
    const reversed = resolveContributions({
      serverItems: [item('gamma', 10), item('beta', 10), item('alpha', 10)],
      registry: registryOf('alpha', 'beta', 'gamma'),
      budget: 5,
    });

    expect(forward.visible.map((v) => v.key)).toEqual(['alpha', 'beta', 'gamma']);
    expect(reversed.visible.map((v) => v.key)).toEqual(forward.visible.map((v) => v.key));
  });
});

describe('groups partition', () => {
  it('considers only the requested group', () => {
    const { visible } = resolveContributions({
      serverItems: [
        item('home', 1, { group: 'primary' }),
        item('bookmarks', 2, { group: 'you' }),
      ],
      registry: registryOf('home', 'bookmarks'),
      budget: 5,
      group: 'primary',
    });

    expect(visible.map((v) => v.key)).toEqual(['home']);
  });

  it('does not overflow items from another group', () => {
    // A `you` item is not "overflowed from the tab bar" — it was never a candidate.
    // Conflating them would duplicate it in You > More AND in You.
    const { overflow } = resolveContributions({
      serverItems: [item('bookmarks', 2, { group: 'you' })],
      registry: registryOf('bookmarks'),
      budget: 1,
      group: 'primary',
    });

    expect(overflow).toHaveLength(0);
  });

  it('treats a missing group as primary', () => {
    const { visible } = resolveContributions({
      serverItems: [item('home', 1)],
      registry: registryOf('home'),
      budget: 5,
      group: 'primary',
    });

    expect(visible.map((v) => v.key)).toEqual(['home']);
  });

  it('considers every group when no group is requested (profile panels)', () => {
    const { visible } = resolveContributions({
      serverItems: [item('a', 1, { group: 'x' }), item('b', 2, { group: 'y' })],
      registry: registryOf('a', 'b'),
      budget: 5,
    });

    expect(visible.map((v) => v.key)).toEqual(['a', 'b']);
  });
});

describe('pinned anchors hold reserved slots', () => {
  it('puts lead first and trail last regardless of server order', () => {
    // The whole reason `pinned` is not a flat key[]: "last" is unsayable in a list.
    const { visible } = resolveContributions({
      serverItems: [item('you', 99), item('spaces', 20), item('home', 50)],
      registry: registryOf('home', 'you', 'spaces'),
      budget: 5,
      pinned: TAB_PINS,
    });

    expect(visible.map((v) => v.key)).toEqual(['home', 'spaces', 'you']);
  });

  it('never overflows an anchor, even when the budget is full', () => {
    const { visible, overflow } = resolveContributions({
      serverItems: [
        item('home', 1),
        item('spaces', 2),
        item('members', 3),
        item('messages', 4),
        item('notifications', 5),
        item('you', 6),
      ],
      registry: registryOf('home', 'spaces', 'members', 'messages', 'notifications', 'you'),
      budget: 5,
      pinned: TAB_PINS,
    });

    // 5 slots: home + 3 free + you. `notifications` is the only one that cannot fit,
    // and `you` holds its slot rather than being pushed out by a higher-order item.
    expect(visible.map((v) => v.key)).toEqual(['home', 'spaces', 'members', 'messages', 'you']);
    expect(overflow.map((o) => o.key)).toEqual(['notifications']);
  });

  it('marks anchors so a caller can style them without re-deriving', () => {
    const { visible } = resolveContributions({
      serverItems: [item('home', 1), item('spaces', 2), item('you', 3)],
      registry: registryOf('home', 'spaces', 'you'),
      budget: 5,
      pinned: TAB_PINS,
    });

    expect(visible.map((v) => [v.key, v.pinned])).toEqual([
      ['home', true],
      ['spaces', false],
      ['you', true],
    ]);
  });

  it('drops an anchor nothing can render rather than synthesizing one', () => {
    // UX.md §1: "never synthesize a tab to fill a slot." A 2-tab bar is legitimate;
    // a tab that navigates nowhere is not.
    const { visible } = resolveContributions({
      serverItems: [item('home', 1), item('spaces', 2)],
      registry: registryOf('home', 'spaces'),
      budget: 5,
      pinned: TAB_PINS,
    });

    expect(visible.map((v) => v.key)).toEqual(['home', 'spaces']);
  });
});

describe('budget is the client\'s', () => {
  it('caps a hostile server nav at the budget (no 12-tab bar)', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`k${i}`, i));
    const { visible, overflow } = resolveContributions({
      serverItems: [...many, item('home', -1), item('you', 99)],
      registry: registryOf(...many.map((m) => m.key), 'home', 'you'),
      budget: 5,
      pinned: TAB_PINS,
    });

    expect(visible).toHaveLength(5);
    expect(overflow).toHaveLength(9);
  });

  it('leaves a short nav short — never pads to the budget', () => {
    const { visible } = resolveContributions({
      serverItems: [item('home', 1), item('notifications', 2), item('you', 3)],
      registry: registryOf('home', 'notifications', 'you'),
      budget: 5,
      pinned: TAB_PINS,
    });

    expect(visible.map((v) => v.key)).toEqual(['home', 'notifications', 'you']);
  });

  it('honours Infinity for surfaces with no chrome limit (settings sections)', () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`s${i}`, i));
    const { visible, overflow } = resolveContributions({
      serverItems: many,
      registry: registryOf(...many.map((m) => m.key)),
      budget: Infinity,
    });

    expect(visible).toHaveLength(40);
    expect(overflow).toHaveLength(0);
  });

  it('renders nothing at budget 0 and overflows the rest', () => {
    const { visible, overflow } = resolveContributions({
      serverItems: [item('a', 1), item('b', 2)],
      registry: registryOf('a', 'b'),
      budget: 0,
    });

    expect(visible).toHaveLength(0);
    expect(overflow.map((o) => o.key)).toEqual(['a', 'b']);
  });

  it('keeps anchors when the budget is smaller than the anchors themselves', () => {
    // A caller bug (budget 1, two anchors). Dropping `you` would strand the member
    // with no route to Settings, so the anchors win and the cap is exceeded. The
    // alternative — silently deleting navigation — is the worse failure.
    const { visible } = resolveContributions({
      serverItems: [item('home', 1), item('you', 2)],
      registry: registryOf('home', 'you'),
      budget: 1,
      pinned: TAB_PINS,
    });

    expect(visible.map((v) => v.key)).toEqual(['home', 'you']);
  });
});

describe('badges do not hide', () => {
  it('aggregates overflowed badges so You can surface them', () => {
    // UX.md §1: "otherwise '3 unread forum replies' is invisible behind a chevron."
    const { overflowBadgeCount } = resolveContributions({
      serverItems: [
        item('home', 1),
        item('spaces', 2),
        item('members', 3),
        item('messages', 4),
        item('forums', 5, { badge: 3 }),
        item('events', 6, { badge: 2 }),
        item('you', 7),
      ],
      registry: registryOf('home', 'spaces', 'members', 'messages', 'forums', 'events', 'you'),
      budget: 5,
      pinned: TAB_PINS,
    });

    // forums(3) + events(2) both overflowed — the You tab must show 5, not nothing.
    expect(overflowBadgeCount).toBe(5);
  });

  it('reports zero when nothing overflowed carries a badge', () => {
    const { overflowBadgeCount } = resolveContributions({
      serverItems: [item('a', 1, { badge: 7 }), item('b', 2)],
      registry: registryOf('a', 'b'),
      budget: 1,
    });

    expect(overflowBadgeCount).toBe(0);
  });

  it('does not count a dropped item\'s badge', () => {
    // An unclaimed key is not reachable from You > More either, so counting its badge
    // would show an aggregate the member can never open or clear.
    const { overflowBadgeCount } = resolveContributions({
      serverItems: [item('home', 1), item('careerboard', 2, { badge: 9 })],
      registry: registryOf('home'),
      budget: 1,
    });

    expect(overflowBadgeCount).toBe(0);
  });

  it('defaults a missing badge to 0 rather than NaN', () => {
    const { visible } = resolveContributions({
      serverItems: [item('a', 1)],
      registry: registryOf('a'),
      budget: 5,
    });

    expect(visible[0]!.badge).toBe(0);
  });
});

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const serverItems = [item('b', 2), item('a', 1)];
    const snapshot = JSON.parse(JSON.stringify(serverItems));

    resolveContributions({
      serverItems,
      registry: registryOf('a', 'b'),
      budget: 5,
    });

    expect(serverItems).toEqual(snapshot);
  });

  it('is deterministic across repeated calls', () => {
    const input = {
      serverItems: [item('a', 1), item('b', 1), item('c', 1)],
      registry: registryOf('a', 'b', 'c'),
      budget: 2,
    };

    expect(resolveContributions(input)).toEqual(resolveContributions(input));
  });

  it('carries the registry value through untouched', () => {
    const home = screen('home');
    const { visible } = resolveContributions({
      serverItems: [item('home', 1)],
      registry: new Map([['home', home]]),
      budget: 5,
    });

    expect(visible[0]!.contribution).toBe(home);
  });
});

describe('the shipped shapes resolve correctly', () => {
  // UX.md §1's own table. If these three drift, the doc is wrong or we are.
  const all = registryOf(
    'home', 'spaces', 'members', 'messages', 'notifications', 'you',
    'forums', 'events', 'jobs', 'listings', 'courses', 'leaderboard'
  );

  it('minimal site: BuddyNext + mediaverse + jetonomy', () => {
    const { visible } = resolveContributions({
      serverItems: [item('home', 10), item('notifications', 20), item('you', 90)],
      registry: all,
      budget: 5,
      pinned: TAB_PINS,
      group: 'primary',
    });

    expect(visible.map((v) => v.key)).toEqual(['home', 'notifications', 'you']);
  });

  it('typical site', () => {
    const { visible } = resolveContributions({
      serverItems: [
        item('home', 10),
        item('spaces', 20),
        item('members', 30),
        item('notifications', 40),
        item('you', 90),
      ],
      registry: all,
      budget: 5,
      pinned: TAB_PINS,
      group: 'primary',
    });

    // All four primary items fit: home + 3 free + you.
    expect(visible.map((v) => v.key)).toEqual([
      'home', 'spaces', 'members', 'notifications', 'you',
    ]);
  });

  it('maximal site: 12 primary items become 5 tabs + 8 in You > More', () => {
    // The row that settled the doc's own ambiguity: 12 primary, 3 free slots, and the
    // 8 overflowed items the table already claimed. Two free slots would overflow 9.
    const keys = [
      'home', 'spaces', 'messages', 'members', 'notifications', 'forums',
      'events', 'jobs', 'listings', 'courses', 'leaderboard', 'bookmarks',
    ];
    const { visible, overflow } = resolveContributions({
      serverItems: [
        ...keys.map((k, i) => item(k, (i + 1) * 10)),
        item('you', 900),
      ],
      registry: registryOf(...keys, 'you'),
      budget: 5,
      pinned: TAB_PINS,
      group: 'primary',
    });

    expect(visible.map((v) => v.key)).toEqual([
      'home', 'spaces', 'messages', 'members', 'you',
    ]);
    expect(overflow).toHaveLength(8);
  });
});
