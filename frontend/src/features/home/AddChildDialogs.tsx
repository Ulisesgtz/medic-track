import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { AddChildModal } from './AddChildModal'
import { addChildTarget, atFreePlanLimit } from './plan'
import type { Account } from './types'

interface AddChildDialogsProps {
  account: Account | undefined
  open: boolean
  onClose: () => void
  /** Wide layouts name the existing child in the plan-limit message. */
  showChildName?: boolean
  /** The button that opened this: it gets the focus back on close (Safari doesn't focus a button when it is clicked). */
  opener?: RefObject<HTMLElement | null>
}

/**
 * What "Agregar hijo" opens. On the free plan with a child already registered
 * the plan-limit pop-up appears right away — the parent isn't made to fill a
 * form just to be told no (mocks 05/15). Otherwise the add-child form opens.
 * Shared by the home and the desktop sidebar so both behave the same.
 */
export function AddChildDialogs({ account, open, onClose, showChildName = false, opener }: AddChildDialogsProps) {
  const navigate = useNavigate()

  // A stable close: the dialogs re-run their focus setup whenever their `onClose` changes identity,
  // and the parents pass a new arrow function on every render.
  const latest = useRef({ onClose, opener })
  useEffect(() => {
    latest.current = { onClose, opener }
  })
  const close = useCallback(() => {
    latest.current.onClose()
    latest.current.opener?.current?.focus()
  }, [])

  if (!open || !account) return null

  // Specs/032: the child is added to the account the family's plan belongs to (the session's own, or the owner's for a Tutor).
  const target = addChildTarget(account)
  if (!target.allowed) return null
  if (atFreePlanLimit(account)) {
    return (
      <FreemiumLimitModal
        childName={showChildName ? target.children[0]?.firstName : undefined}
        onStayFree={close}
        onViewPlans={() => navigate('/planes')}
        opener={opener}
      />
    )
  }
  return <AddChildModal accountId={target.accountId} onClose={close} />
}
