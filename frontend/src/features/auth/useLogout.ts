import { useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Ends the Clerk session and drops every cached account/child/consultation
 * query, so nothing from the signed-out tutor survives in memory for
 * whoever signs in next on the same device. `RequireSession` takes care of
 * navigating to `/login` once `useAuth().isSignedIn` flips to false; the explicit
 * `redirectUrl` stops Clerk from sending the tutor to `/` (→ the signup) first.
 */
export function useLogout() {
  const { signOut } = useAuth()
  const queryClient = useQueryClient()

  return async function logout() {
    await signOut({ redirectUrl: '/login' })
    queryClient.clear()
  }
}
