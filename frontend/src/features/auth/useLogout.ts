import { useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import type { Account } from '../home/types'
import { unsubscribeOnLogout } from '../reminders/pushDevice'

/**
 * Ends the Clerk session and drops every cached account/child/consultation
 * query, so nothing from the signed-out tutor survives in memory for
 * whoever signs in next on the same device. `RequireSession` takes care of
 * navigating to `/login` once `useAuth().isSignedIn` flips to false; the explicit
 * `redirectUrl` stops Clerk from sending the tutor to `/` (→ the signup) first.
 *
 * Before that, this browser stops receiving the tutor's dose reminders (specs/011, FR-012): best
 * effort and at most 3 s, so a slow network never holds the logout.
 */
export function useLogout() {
  const { signOut, getToken } = useAuth()
  const queryClient = useQueryClient()

  return async function logout() {
    const account = queryClient.getQueryData<Account>(['accounts', 'me'])
    if (account) await unsubscribeOnLogout(account.id, await getToken())
    await signOut({ redirectUrl: '/login' })
    queryClient.clear()
  }
}
