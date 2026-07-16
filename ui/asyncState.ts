/**
 * Which of the async states to show — the pure decision behind AsyncBoundary.
 *
 * UX.md §9: every async surface handles SIX states — loading, loaded, empty, error,
 * offline, stale-while-offline. The shipped apps conflated offline with error (same red
 * screen, same "try again" that cannot succeed while the radio is off) and often skipped
 * empty entirely. Encoding the choice as one pure function means the boundary cannot
 * forget a state, and the precedence between them is decided once here rather than in a
 * tangle of ternaries per screen.
 */

export type AsyncState =
  | 'loading' // first load, nothing to show yet
  | 'ready' // have data, render it
  | 'empty' // loaded successfully, but zero items
  | 'error' // failed, and we have nothing cached to fall back to
  | 'offline' // no connection, nothing cached — distinct copy, auto-recovers
  | 'stale'; // offline BUT we have cached data — show it with an offline bar

export interface AsyncInputs {
  /** React Query status. */
  status: 'pending' | 'success' | 'error';
  /** Do we have any data in hand (cached or fresh)? */
  hasData: boolean;
  /** Is the successfully-loaded data empty (zero items)? */
  isEmpty: boolean;
  /** Is the device offline right now? */
  isOffline: boolean;
}

/**
 * Resolve the state to render.
 *
 * Precedence, and why:
 *   1. hasData + offline  -> STALE. Never hide content because we are offline. Showing the
 *      last-known feed under an offline bar beats a blank "no connection" screen.
 *   2. hasData            -> READY or EMPTY. We can render; empty only when truly zero.
 *   3. offline (no data)  -> OFFLINE, not error. Different copy, different icon, and it
 *      auto-recovers on reconnect rather than demanding a doomed retry.
 *   4. error              -> ERROR.
 *   5. otherwise          -> LOADING.
 */
export function selectAsyncState({ status, hasData, isEmpty, isOffline }: AsyncInputs): AsyncState {
  // 1. Offline but we have something cached — show it. Content wins over connectivity.
  if (hasData && isOffline) {
    return 'stale';
  }

  // 2. We have data and we are online.
  if (hasData) {
    return status === 'success' && isEmpty ? 'empty' : 'ready';
  }

  // No data in hand from here on.

  // 3. Offline with nothing cached is NOT an error — it recovers on its own.
  if (isOffline) {
    return 'offline';
  }

  // 4. A real failure with nothing to fall back to.
  if (status === 'error') {
    return 'error';
  }

  // 5. Still loading.
  return 'loading';
}
