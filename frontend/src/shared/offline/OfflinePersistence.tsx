import { useEffect } from 'react'
import { useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { allowedSubjects, PRUNE_EVERY_MS, pruneExpired, pruneSubjects, startPersistence } from './persistence'

/**
 * Keeps on the installed phone what the parents' session sees (specs/067), once Clerk confirms who it is: the owner is
 * `user:<clerkUserId>`. Each hour the answers older than 7 days go, and when the account's children change the ones it no longer
 * sees go too (FR-013, FR-014). On a computer `startPersistence` does nothing. Mounted once, inside both providers.
 */
export function OfflinePersistence() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    let stop: (() => void) | undefined
    let cancelled = false
    void startPersistence(queryClient, `user:${userId}`).then((s) => {
      if (cancelled) s()
      else stop = s
    })
    const prune = setInterval(() => void pruneExpired(queryClient), PRUNE_EVERY_MS)
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return
      const key = event.query.queryKey
      if (key[0] !== 'accounts' || key[1] !== 'me') return
      const account = event.query.state.data as Parameters<typeof allowedSubjects>[0] | undefined
      if (account?.id && Array.isArray(account.children)) void pruneSubjects(queryClient, allowedSubjects(account))
    })
    return () => {
      cancelled = true
      stop?.()
      clearInterval(prune)
      unsubscribe()
    }
  }, [isLoaded, isSignedIn, userId, queryClient])

  return null
}
