/**
 * uiStrings — the localizable copy mobile-core's own components render.
 *
 * mobile-core stays free of react-i18next (it is a shell, not an app), yet ErrorState,
 * OfflineState, ConfirmSheet, ActionSheet, and ScreenHeader all render user-facing copy.
 * This module is the seam: a tiny module-level store with English defaults that the HOST
 * APP overwrites from its own i18n catalog (at boot and again on every locale change).
 *
 * Components read it via `useUiStrings()` (useSyncExternalStore) so mounted screens
 * re-render the moment the app pushes a new locale's strings; non-React code can call
 * `getUiStrings()` for a snapshot.
 */

import { useSyncExternalStore } from 'react';

export interface UiStrings {
  /** ErrorState title. */
  somethingWrong: string;
  /** ErrorState body. */
  couldNotLoad: string;
  /** ErrorState retry button. */
  retry: string;
  /** ConfirmSheet / ActionSheet cancel default. */
  cancel: string;
  /** ConfirmSheet confirm default. */
  confirm: string;
  /** ScreenHeader back-button accessibility label. */
  back: string;
  /** Skeleton accessibility label. */
  loading: string;
  /** OfflineState title. */
  offlineTitle: string;
  /** OfflineState body. */
  offlineMessage: string;
  /** OfflineBar text (shown above cached content). */
  offlineBar: string;
}

/** English defaults — the fallback when the host app never calls setUiStrings. */
const DEFAULT_UI_STRINGS: UiStrings = {
  somethingWrong: 'Something went wrong',
  couldNotLoad: 'We could not load this. Please try again.',
  retry: 'Try again',
  cancel: 'Cancel',
  confirm: 'Confirm',
  back: 'Back',
  loading: 'Loading',
  offlineTitle: 'You are offline',
  offlineMessage: 'This will load as soon as you are back online.',
  offlineBar: 'Offline — showing saved content',
};

let current: UiStrings = DEFAULT_UI_STRINGS;

const listeners = new Set<() => void>();

/**
 * Overlay translated copy onto the store and notify mounted components. Empty or missing
 * values are ignored per key (a half-translated catalog never blanks a button label).
 */
export function setUiStrings(partial: Partial<UiStrings>): void {
  const next = { ...current };
  let changed = false;
  for (const key of Object.keys(partial) as (keyof UiStrings)[]) {
    const value = partial[key];
    if (typeof value === 'string' && value.length > 0 && next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  current = next;
  listeners.forEach((listener) => listener());
}

/** Snapshot of the current strings — for non-React callers. */
export function getUiStrings(): UiStrings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current strings, re-rendering the component when the host app swaps locales. */
export function useUiStrings(): UiStrings {
  return useSyncExternalStore(subscribe, getUiStrings, getUiStrings);
}
