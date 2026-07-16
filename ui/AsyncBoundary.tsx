/**
 * AsyncBoundary — you cannot mount an async surface without answering every state.
 *
 * UX.md §9: "Enforcement by type signature, not lint." The props REQUIRE a skeleton and an
 * empty state (title + message + optional action); there is no way to render this component
 * without them, so a blank screen or a missing empty state is a type error, not a bug
 * someone finds in production. loading/error/offline/stale have sensible built-ins.
 *
 * The state CHOICE is the tested pure selectAsyncState; this only maps the choice to the
 * matching view and passes cached data through in the stale case.
 */

import { selectAsyncState } from './asyncState';
import { EmptyState, ErrorState, OfflineBar, OfflineState } from './states';
import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

export interface AsyncBoundaryProps<T> {
  /** The query-ish inputs. Shaped to accept a React Query result directly. */
  query: {
    status: 'pending' | 'success' | 'error';
    data: T | undefined;
    refetch: () => void;
  };
  /** Is the item set empty? Defaults to false; pass for list surfaces. */
  isEmpty?: (data: T) => boolean;
  /** Current connectivity. */
  isOffline?: boolean;
  /** REQUIRED — a skeleton shaped like the real layout. No blank screens. */
  skeleton: ReactNode;
  /** REQUIRED — an empty state that tells the member what to do next. */
  empty: { title: string; message: string; action?: { label: string; onPress: () => void } };
  children: (data: T) => ReactNode;
}

export function AsyncBoundary<T>({
  query,
  isEmpty,
  isOffline = false,
  skeleton,
  empty,
  children,
}: AsyncBoundaryProps<T>) {
  const hasData = query.data !== undefined;
  const state = selectAsyncState({
    status: query.status,
    hasData,
    isEmpty: hasData && !!isEmpty?.(query.data as T),
    isOffline,
  });

  switch (state) {
    case 'loading':
      return <>{skeleton}</>;
    case 'error':
      return <ErrorState onRetry={query.refetch} />;
    case 'offline':
      return <OfflineState />;
    case 'empty':
      return <EmptyState title={empty.title} message={empty.message} action={empty.action} />;
    case 'stale':
      return (
        <View style={styles.fill}>
          <OfflineBar />
          {children(query.data as T)}
        </View>
      );
    case 'ready':
      return <>{children(query.data as T)}</>;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
