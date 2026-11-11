import { useEffect } from 'react'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useConnectivity } from './connectivity'

// Another day without a signal (specs/067, research R9). «Hoy» asks for the data of a day (`['overview', child, <day>]`), so the
// morning after, without a network, today's key isn't on the phone. The screen then shows the latest answer of the same kind —
// same subject, another day — exactly as the server sent it: the banner says which day it is from, and the phone recalculates
// nothing (FR-008). The copy goes under today's key with ITS OWN hour, so the next answer from the server simply replaces it.

const sameStart = (key: QueryKey, prefix: QueryKey) => prefix.every((part, i) => JSON.stringify(key[i]) === JSON.stringify(part))

/** The newest answer whose key starts like `prefix`, other than `except`. */
export function latestAnswer(queryClient: QueryClient, prefix: QueryKey, except: QueryKey): { data: unknown; updatedAt: number } | null {
  const exceptHash = JSON.stringify(except)
  let best: { data: unknown; updatedAt: number } | null = null
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.state.data === undefined || JSON.stringify(query.queryKey) === exceptHash) continue
    if (query.queryKey.length !== except.length || !sameStart(query.queryKey, prefix)) continue
    if (!best || query.state.dataUpdatedAt > best.updatedAt) best = { data: query.state.data, updatedAt: query.state.dataUpdatedAt }
  }
  return best
}

/**
 * Without a connection and with nothing for `queryKey`, put there the newest answer of the same kind (the key's first
 * `prefixLength` parts). With a connection it does nothing.
 */
export function useOfflineFallback(queryKey: QueryKey, prefixLength: number) {
  const queryClient = useQueryClient()
  const connectivity = useConnectivity()
  const hash = JSON.stringify(queryKey)

  useEffect(() => {
    if (connectivity !== 'offline') return
    const key = JSON.parse(hash) as QueryKey
    if (queryClient.getQueryData(key) !== undefined) return
    const found = latestAnswer(queryClient, key.slice(0, prefixLength), key)
    if (found) queryClient.setQueryData(key, found.data, { updatedAt: found.updatedAt })
  }, [connectivity, hash, prefixLength, queryClient])
}
