import { MutationCache, QueryClient } from '@tanstack/react-query'
import { pushMarkNotice } from '../marks/markNotices'
import { isInstalledPhone } from './device'
import { isOffline, OfflineError } from './connectivity'

// Nothing is sent nor painted as saved without a connection (specs/067, FR-007, research R7).

/** The one notice for an action that needs a connection: one line per kind, never repeated. */
export function notifyNeedsConnection(kind: 'mark' | 'action') {
  pushMarkNotice({
    doseId: `offline:${kind}`,
    kind: kind === 'mark' ? 'mark_needs_connection' : 'action_needs_connection',
    name: '',
    time: '',
  })
}

/** A failure that happened because there is no connection. */
export function isConnectionFailure(error: unknown): boolean {
  return error instanceof OfflineError || (error instanceof TypeError && isOffline())
}

/** Inside a mutation: refuse before anything is sent. */
export function guardMutation() {
  if (isOffline()) throw new OfflineError()
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The app's QueryClient. Mutations run with `networkMode: 'always'`: without a connection they FAIL — by default TanStack would
 * pause them and send them on its own when the network comes back, a hidden sync this stage must not have. The cache refuses a
 * mutation before its request and says it needs a connection. On the installed phone the answers stay in memory a day (instead of
 * 5 minutes), so a screen opened again without a signal still has the phone's copy.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onMutate: () => guardMutation(),
      onError: (error) => {
        if (isConnectionFailure(error)) notifyNeedsConnection('action')
      },
    }),
    defaultOptions: {
      mutations: { networkMode: 'always' },
      queries: isInstalledPhone() ? { gcTime: DAY_MS } : {},
    },
  })
}
