import type { QueryClient } from '@tanstack/react-query'
import { isOffline } from './connectivity'
import { shouldPersist } from './persistPolicy'

// How a screen reads a query without a connection (specs/067, FR-003, FR-006, research R11). TanStack keeps the data when a refetch
// fails, but the screens used to check `isError` first and showed the load error over data they had. Now:
//  - data on screen → the data (the banner says they are from earlier), never the error;
//  - no data and no connection → «Esta pantalla necesita conexión.» (`OfflineMissing`), not the eternal «Cargando…» of a paused
//    query nor the load error;
//  - otherwise as before.

interface QueryLike {
  data: unknown
  isError: boolean
  fetchStatus: string
}

/** No data and nothing to do about it until the connection is back. */
export function needsConnection(query: QueryLike): boolean {
  if (query.data !== undefined) return false
  // Paused (TanStack waits for the network), failed, or never asked (a screen opened without a session): all wait for the network.
  return query.fetchStatus === 'paused' || (isOffline() && query.fetchStatus !== 'fetching')
}

/** The load error, only when there is nothing to show and it isn't the connection. */
export function showsLoadError(query: QueryLike): boolean {
  return query.isError && query.data === undefined && !isOffline()
}

/** The hour of the OLDEST answer the screen is showing (the queries in use that may be kept), or null with none. */
export function oldestShownAnswer(queryClient: QueryClient): number | null {
  let oldest: number | null = null
  // On screen = has an observer, even a disabled one: without a session the screens' queries are disabled and show the copy.
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.getObserversCount() === 0 || query.state.data === undefined || !shouldPersist(query.queryKey, 'success')) continue
    const at = query.state.dataUpdatedAt
    if (at > 0 && (oldest === null || at < oldest)) oldest = at
  }
  return oldest
}
