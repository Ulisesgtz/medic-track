import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'

interface HistoryEntryProps {
  /** The child's history screen. */
  to: string
  /** The account is on the free plan (specs/031): the search is the paid plan's, so the plan notice opens instead. */
  free: boolean
  className: string
  children: ReactNode
}

/**
 * "Buscar en el historial", in the child's list of consultations (both designs). With the paid plan — or while the
 * account hasn't loaded, where the server decides — it is a link to the history; on the free plan it is a button, marked
 * "Plan completo", that opens the plan notice. The list itself is the same either way: nothing registered is ever hidden.
 */
export function HistoryEntry({ to, free, className, children }: HistoryEntryProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])

  if (!free) {
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
        <span className="ml-2 rounded-full border border-hint-border bg-hint px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-action uppercase">
          Plan completo
        </span>
      </button>
      {open && (
        <FreemiumLimitModal reason="history_search" onStayFree={close} onViewPlans={() => navigate('/planes')} opener={buttonRef} />
      )}
    </>
  )
}
