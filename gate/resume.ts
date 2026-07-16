/**
 * When to re-decide the app gate.
 *
 * ARCHITECTURE.md: "Re-decide the gate on cold start AND on resume." Cold start is the
 * boot route's effect. Resume is this: the app was backgrounded — possibly for hours, long
 * enough for a licence to lapse or a site to disable the app — and is now foreground
 * again. The gate must be re-run against the live server, because `app_enabled` was never
 * persisted (a stored `true` outliving an expired licence is the hole 0.14 exists to
 * avoid).
 *
 * The only decision with any subtlety is WHICH transition counts. This is a pure predicate
 * over the AppState value so it can be tested without a device, and so "what is a resume"
 * is one definition rather than a condition re-typed at each call site.
 */

/**
 * The AppState values we care about. Modelled as a string union rather than imported from
 * react-native so this file stays in the node-safe barrel.
 *
 * 'active'     — foreground, receiving events.
 * 'inactive'   — foreground but transitioning (the app switcher, a control-centre pull,
 *                an incoming-call banner). Transient, NOT a real return.
 * 'background' — fully backgrounded. THIS is what a real resume comes back from.
 */
export type AppStateValue = 'active' | 'inactive' | 'background' | 'unknown' | 'extension';

/**
 * Is this transition a genuine resume — one that should re-run the gate?
 *
 * TRUE only for background -> active. Deliberately NOT inactive -> active: a control-centre
 * pull or the app switcher flicks through 'inactive' constantly, and re-running the gate on
 * each would mean a network round-trip every time the member glances at a notification. A
 * real return-to-app always passes through 'background' first, so gating on that edge
 * catches every case that matters and none that do not.
 */
export function isResumeTransition(prev: AppStateValue, next: AppStateValue): boolean {
  return prev === 'background' && next === 'active';
}
