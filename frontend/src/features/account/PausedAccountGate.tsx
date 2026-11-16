import { useEffect, useState, type PropsWithChildren } from 'react'
import { useAuth } from '@clerk/react'
import { fetchMe } from '../auth/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Account } from '../home/types'
import { ACCOUNT_PAUSED_EVENT } from '../../shared/accountPause'
import { Notice } from '../../shared/ui/Notice'
import { PAUSED } from './accountText'
import { useCanceledNotice } from './canceledNotice'
import { DeletionPendingScreen } from './DeletionPendingScreen'

/**
 * Wraps the routes (specs/070): a signed-in account with a pending deletion only ever sees `DeletionPendingScreen`. A 409
 * `account_deletion_pending` anywhere (another tab asked for it) reads the account again, so an open screen turns paused too.
 */
export function PausedAccountGate({ children }: PropsWithChildren) {
  const { isSignedIn, getToken } = useAuth()
  const [paused, setPaused] = useState(false)
  const queryClient = useQueryClient()
  // Only READS the cached account, never fetches it until the API says the account is paused: the gate wraps every route, so a fetch of its own would run on /registro
  // right after Clerk signs the new user in, before POST /accounts creates the account, and its 404 would overwrite the account
  // the signup just stored. The screens that need the account (RequireSession) fetch it; this one shows the pause when it arrives.
  const cached = queryClient.getQueryData<Account>(['accounts', 'me'])
  const account = useQuery<Account>({
    queryKey: ['accounts', 'me'],
    queryFn: async () => fetchMe(await getToken()),
    enabled: (paused || !!cached?.deletion) && isSignedIn === true,
    retry: false,
  }).data
  const [canceled, dismissCanceled] = useCanceledNotice()

  useEffect(() => {
    const onPaused = () => {
      setPaused(true)
      void queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
    }
    window.addEventListener(ACCOUNT_PAUSED_EVENT, onPaused)
    return () => window.removeEventListener(ACCOUNT_PAUSED_EVENT, onPaused)
  }, [queryClient])

  if (isSignedIn && account?.deletion) {
    return <DeletionPendingScreen account={account} scheduledFor={account.deletion.scheduledFor} />
  }
  return (
    <>
      {canceled && (
        <div className="fixed inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[90vw] flex-col items-end gap-1">
          <Notice tone="success">
            {PAUSED.canceled} {PAUSED.subscriptionNote}
          </Notice>
          <button
            type="button"
            onClick={dismissCanceled}
            className="min-h-11 cursor-pointer rounded-xl bg-surface px-3 text-sm font-extrabold text-ink underline underline-offset-2"
          >
            {PAUSED.dismiss}
          </button>
        </div>
      )}
      {children}
    </>
  )
}
