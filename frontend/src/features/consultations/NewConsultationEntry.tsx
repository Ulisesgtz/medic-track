import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'

interface NewConsultationEntryProps {
  /** The "Nueva consulta" page. */
  to: string
  /**
   * The free plan has a treatment still running (specs/030): the plan pop-up opens right away, as "Agregar hijo"
   * does at the child limit, instead of a form the server would refuse after the parent filled it in.
   */
  blocked: boolean
  className: string
  children: ReactNode
}

/**
 * The "Nueva consulta" entry of the child's detail, in both designs. A link to the form, or — when the free plan
 * doesn't allow another consultation yet — a button that opens the plan pop-up. Same look either way (`className`).
 */
export function NewConsultationEntry({ to, blocked, className, children }: NewConsultationEntryProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])

  if (!blocked) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    )
  }

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && (
        <FreemiumLimitModal reason="active_treatment" onStayFree={close} onViewPlans={() => navigate('/planes')} opener={buttonRef} />
      )}
    </>
  )
}
