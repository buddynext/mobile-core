/**
 * selectAsyncState — the six states and the precedence between them.
 *
 * The two tests that encode real shipped bugs: offline-with-cache must NOT hide content
 * (stale, not a blank offline screen), and offline-without-cache must NOT read as an error
 * (a doomed "try again" while the radio is off).
 */

import { selectAsyncState, type AsyncInputs } from './asyncState';

const inputs = (over: Partial<AsyncInputs>): AsyncInputs => ({
  status: 'pending',
  hasData: false,
  isEmpty: false,
  isOffline: false,
  ...over,
});

describe('the happy path', () => {
  it('loading before any data arrives', () => {
    expect(selectAsyncState(inputs({ status: 'pending' }))).toBe('loading');
  });

  it('ready once data is in hand', () => {
    expect(selectAsyncState(inputs({ status: 'success', hasData: true }))).toBe('ready');
  });

  it('empty only when loaded AND zero items', () => {
    expect(selectAsyncState(inputs({ status: 'success', hasData: true, isEmpty: true }))).toBe(
      'empty'
    );
  });
});

describe('offline is not error', () => {
  it('offline with nothing cached is OFFLINE, not error', () => {
    // The shipped bug: same red error screen with a retry that cannot work while offline.
    expect(selectAsyncState(inputs({ isOffline: true }))).toBe('offline');
  });

  it('a genuine failure with nothing cached is ERROR', () => {
    expect(selectAsyncState(inputs({ status: 'error' }))).toBe('error');
  });

  it('an error while offline still reads as OFFLINE (the actionable cause)', () => {
    // If both are true with no data, offline is the useful message — reconnecting fixes it.
    expect(selectAsyncState(inputs({ status: 'error', isOffline: true }))).toBe('offline');
  });
});

describe('content wins over connectivity', () => {
  it('offline WITH cached data shows it as stale, never a blank offline screen', () => {
    // UX.md §9: never hide content because we are offline.
    expect(selectAsyncState(inputs({ status: 'success', hasData: true, isOffline: true }))).toBe(
      'stale'
    );
  });

  it('stale beats empty — cached data under an offline bar, even if a refetch would be empty', () => {
    expect(
      selectAsyncState(inputs({ status: 'success', hasData: true, isEmpty: true, isOffline: true }))
    ).toBe('stale');
  });

  it('renders cached data even mid-error (background refetch failed)', () => {
    // Have data, a background refetch errored, online: keep showing what we have.
    expect(selectAsyncState(inputs({ status: 'error', hasData: true }))).toBe('ready');
  });
});
