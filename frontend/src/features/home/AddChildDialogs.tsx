import { useNavigate } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { AddChildModal } from './AddChildModal'
import { atFreePlanLimit } from './plan'
import type { Account } from './types'

interface AddChildDialogsProps {
  accountId: string
  account: Account | undefined
  open: boolean
  onClose: () => void
  /** Wide layouts name the existing child in the plan-limit message. */
  showChildName?: boolean
}

/**
 * What "Agregar hijo" opens. On the free plan with a child already registered
 * the plan-limit pop-up appears right away — the parent isn't made to fill a
 * form just to be told no (mocks 05/15). Otherwise the add-child form opens.
 * Shared by the home and the desktop sidebar so both behave the same.
 */
export function AddChildDialogs({ accountId, account, open, onClose, showChildName = false }: AddChildDialogsProps) {
  const navigate = useNavigate()
  if (!open) return null

  if (account && atFreePlanLimit(account)) {
    return (
      <FreemiumLimitModal
        childName={showChildName ? account.children[0]?.firstName : undefined}
        onStayFree={onClose}
        onViewPlans={() => navigate('/planes')}
      />
    )
  }
  return <AddChildModal accountId={accountId} onClose={onClose} />
}
