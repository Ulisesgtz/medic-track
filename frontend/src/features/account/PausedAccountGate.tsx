import { useEffect, type PropsWithChildren } from 'react'
import { useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentAccount } from '../auth/useCurrentAccount'
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
  const { isSignedIn } = useAuth()
  const queryClient = useQueryClient()
  const account = useCurrentAccount().data
  const [canceled, dismissCanceled] = useCanceledNotice()

  useEffect(() => {
    const onPaused = () => void queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
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
