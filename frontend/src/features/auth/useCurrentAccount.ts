import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from './api'

/**
 * The tutor's own account, resolved from their verified Clerk session (`GET
 * /accounts/me`) — the single source of "which account is this" for the
 * whole app, replacing the old `account_id`-in-`localStorage` (specs/003/007).
 * Disabled until Clerk itself has loaded and confirmed a signed-in session,
 * so it never fires with a stale/missing token.
 */
export function useCurrentAccount() {
  const { isLoaded, isSignedIn, getToken } = useAuth()

  return useQuery({
    queryKey: ['accounts', 'me'],
    queryFn: async () => fetchMe(await getToken()),
    enabled: isLoaded && isSignedIn === true,
    retry: false,
  })
}
