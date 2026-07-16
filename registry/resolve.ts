/**
 * The one algorithm — UX.md §"The one algorithm".
 *
 * Five call sites use this and nothing else: tab bar, profile panels, space tabs,
 * composer actions, settings sections. It is deliberately pure and React-free so that
 * "what does this site's nav look like?" is a question with a unit test rather than a
 * screenshot.
 *
 * It exists because the shipped apps answered that question five times, slightly
 * differently each time, inside five components. Register a key, get correct behaviour
 * everywhere.
 *
 * The two halves of the contract pull against each other on purpose:
 *
 *   ORDER AND INTENT ARE THE SERVER'S.  `ShellNavService::resolve()` already decided
 *   what this community shows and in what sequence. A client update must never
 *   reorder the owner's nav.
 *
 *   BUDGET AND ANCHORS ARE THE CLIENT'S.  Only the app knows a phone fits five tabs.
 *   A server misconfig must never produce a twelve-tab bar.
 *
 * Neither can break the other. That is the whole design.
 */

/**
 * One item of server intent, as `GET /shell-nav` returns it.
 *
 * `icon` and `url` are deliberately absent: the icon is resolved through the icon
 * registry by the renderer, and `url` is the web fallback. Neither affects resolution,
 * so neither belongs in this function's input.
 */
export interface ServerNavItem {
  /** The join column. Must match a module's nav claim. */
  key: string;
  label: string;
  /** Server-assigned sequence. Lower is earlier. */
  order: number;
  /** Unread count. Absent means none. */
  badge?: number;
  /** Defaults to `primary`. */
  group?: string;
}

/**
 * Client-owned anchors that hold reserved slots.
 *
 * REFINED FROM THE DOC (2026-07-16). UX.md's signature says `pinned: key[]`, but the
 * tab bar it describes needs "slot 1 pinned `home`, slot 5 pinned `you`" — and a flat
 * list has no way to say "last". The doc was underspecified rather than wrong, so this
 * is the narrowest shape that can express it.
 *
 * An anchor still has to be a real, claimed item. Anchors are not synthesized here:
 * the host pushes its own `home`/`you` items into `serverItems` and registers their
 * screens like any other contribution. That keeps this function's job to resolution
 * and keeps "what is a tab" answerable in one place.
 */
export interface PinnedSlots {
  /** Keys held at the start, in this order. */
  lead?: readonly string[];
  /** Keys held at the end, in this order. */
  trail?: readonly string[];
}

export interface ResolveInput<T> {
  serverItems: readonly ServerNavItem[];
  /** What THIS build can actually render. Key to the module's contribution. */
  registry: ReadonlyMap<string, T>;
  /** Chrome capacity. `Infinity` for surfaces with no limit. */
  budget: number;
  pinned?: PinnedSlots;
  /** When set, only items in this group are candidates. Omit to consider all. */
  group?: string;
}

export interface Resolved<T> {
  key: string;
  label: string;
  order: number;
  /** Normalised — never undefined, never NaN. */
  badge: number;
  group: string;
  /** The registry value, passed through by reference and never inspected. */
  contribution: T;
  /** True when this item holds a reserved slot. */
  pinned: boolean;
}

export interface Resolution<T> {
  visible: Resolved<T>[];
  /** Renderable, claimed items that did not fit. Destinations, not dead rows. */
  overflow: Resolved<T>[];
  /**
   * Total badge count across `overflow`.
   *
   * UX.md §1: "Badges must not hide." An overflowed item's badge is invisible behind a
   * chevron, so the You tab shows the aggregate. Computed here rather than in the tab
   * bar because it is a property of the resolution, and because the tab bar deriving it
   * again is how the two drift apart.
   */
  overflowBadgeCount: number;
}

const DEFAULT_GROUP = 'primary';

/**
 * Total order: server `order`, then `key`.
 *
 * The key tie-break is not cosmetic. Without it, two items sharing an `order` resolve
 * in whatever sequence the JSON arrived in — a nav that reshuffles between requests
 * for no visible reason. Array.prototype.sort is stable in every engine we ship on, so
 * this makes the result a function of the DATA rather than of its serialisation.
 */
const byOrderThenKey = (a: ServerNavItem, b: ServerNavItem): number =>
  a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

export function resolveContributions<T>({
  serverItems,
  registry,
  budget,
  pinned = {},
  group,
}: ResolveInput<T>): Resolution<T> {
  const lead = pinned.lead ?? [];
  const trail = pinned.trail ?? [];
  const anchors = new Set([...lead, ...trail]);

  // 1. Join on key + 2. partition by group.
  //
  // An item that survives here is renderable AND claimed. Everything dropped is dropped
  // for good — it never reappears as overflow. A key with no module would be a row in
  // You > More that navigates nowhere, which is worse than its absence: the member can
  // see it and it does not work.
  const candidates = serverItems
    .filter((candidate) => registry.has(candidate.key))
    .filter((candidate) => group === undefined || (candidate.group ?? DEFAULT_GROUP) === group);

  const resolve = (candidate: ServerNavItem): Resolved<T> => ({
    key: candidate.key,
    label: candidate.label,
    order: candidate.order,
    badge: candidate.badge ?? 0,
    group: candidate.group ?? DEFAULT_GROUP,
    contribution: registry.get(candidate.key)!,
    pinned: anchors.has(candidate.key),
  });

  // 3. Sort. Copy first — `serverItems` belongs to the caller (often React state, where
  // an in-place sort is a silent render bug).
  const sorted = [...candidates].sort(byOrderThenKey).map(resolve);

  const byKey = new Map(sorted.map((entry) => [entry.key, entry]));

  // 4. Pin anchors into reserved slots.
  //
  // An anchor that resolved to nothing is simply absent. UX.md §1: "never synthesize a
  // tab to fill a slot" — a 2-tab bar is legitimate; a tab that goes nowhere is not.
  const pick = (keys: readonly string[]): Resolved<T>[] =>
    keys.map((key) => byKey.get(key)).filter((entry): entry is Resolved<T> => entry !== undefined);

  const leadItems = pick(lead);
  const trailItems = pick(trail);
  const middle = sorted.filter((entry) => !anchors.has(entry.key));

  // 5. Budget.
  //
  // Anchors are never overflowed, so they consume budget before anything else. When the
  // budget is smaller than the anchors themselves — a caller bug, since the tab bar
  // pins 2 into 5 — the anchors still render and the cap is exceeded. Honouring the cap
  // instead would mean silently deleting the member's route to Settings, and a bar one
  // tab too wide is a far better failure than navigation that vanishes.
  const free = Math.max(0, budget - leadItems.length - trailItems.length);
  const fitted = middle.slice(0, free);
  const overflow = middle.slice(free);

  return {
    visible: [...leadItems, ...fitted, ...trailItems],
    overflow,
    overflowBadgeCount: overflow.reduce((total, entry) => total + entry.badge, 0),
  };
}
