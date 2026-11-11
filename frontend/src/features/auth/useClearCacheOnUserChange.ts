import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { wipeOffline } from '../../shared/offline/persistence'
import { currentSnapshot, forgetSnapshot } from '../../shared/offline/offlineSession'

/**
 * Drops every cached query when the signed-in user changes for any reason —
 * our own logout already clears it, but a session that expires, is signed out
 * from another tab, or is replaced by a different tutor's login would
 * otherwise leave the previous tutor's account, children and consultations in
 * memory (their query keys carry no user id) until each refetch lands.
 * Mounted once, inside both providers.
 *
 * The phone's copy for offline (specs/067, FR-011) goes with it: a user who leaves takes it all. The one exception is the start of
 * the app, when Clerk confirms the same user whose copy was shown without a network — that copy is theirs and stays.
 */
export function useClearCacheOnUserChange() {
  const { isLoaded, userId } = useAuth()
  const queryClient = useQueryClient()
  const previous = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!isLoaded) return
    const current = userId ?? null
    const before = previous.current
    previous.current = current
    if (before === undefined || before === current) return
    if (before === null && current !== null && currentSnapshot()?.owner === `user:${current}`) return
    if (before !== null || currentSnapshot()?.owner.startsWith('user:')) {
      forgetSnapshot()
      void wipeOffline(queryClient)
    } else {
      queryClient.clear()
    }
  }, [isLoaded, userId, queryClient])
}
