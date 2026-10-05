import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Drops every cached query when the signed-in user changes for any reason —
 * our own logout already clears it, but a session that expires, is signed out
 * from another tab, or is replaced by a different tutor's login would
 * otherwise leave the previous tutor's account, children and consultations in
 * memory (their query keys carry no user id) until each refetch lands.
 * Mounted once, inside both providers.
 */
export function useClearCacheOnUserChange() {
  const { isLoaded, userId } = useAuth()
  const queryClient = useQueryClient()
  const previous = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!isLoaded) return
    const current = userId ?? null
    if (previous.current !== undefined && previous.current !== current) {
      queryClient.clear()
    }
    previous.current = current
  }, [isLoaded, userId, queryClient])
}
