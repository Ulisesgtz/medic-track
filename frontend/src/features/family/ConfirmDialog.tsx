import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  busy: boolean
  /** A sentence when the server refused or the network failed. */
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  /** The button that opened this: focus goes back to it (Safari doesn't focus a clicked button). */
  opener: RefObject<HTMLElement | null>
}

/**
 * The confirmation of leaving or removing someone from the family (specs/032): neutral words — what happens and what does
 * not, no advice (Principio I). A real dialog like the others: rendered into <body>, Escape and the backdrop cancel (not
 * while it works), focus starts on "Cancelar" (the safe choice) and Tab stays inside.
 */
export function ConfirmDialog({ title, children, confirmLabel, busyLabel, busy, error, onConfirm, onCancel, opener }: ConfirmDialogProps) {
  const id = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  })

  useEffect(() => {
    const restoreTo = opener.current
    cancelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busyRef.current) onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const active = document.activeElement
      if (event.shiftKey && active === cancelRef.current) {
        event.preventDefault()
        confirmRef.current?.focus()
      } else if (!event.shiftKey && active === confirmRef.current) {
        event.preventDefault()
        cancelRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      restoreTo?.focus()
    }
  }, [onCancel, opener])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={() => !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={`${id}-title`} className="text-2xl font-black tracking-tight text-ink">
          {title}
        </h2>
        <div id={`${id}-body`} className="mt-3 flex flex-col gap-2 text-base leading-relaxed text-body">
          {children}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[13px] font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-3 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 cursor-pointer rounded-2xl bg-ink px-5 py-3 text-[15px] font-extrabold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
