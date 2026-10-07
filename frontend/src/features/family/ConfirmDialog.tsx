import { useEffect, useId, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'

interface ConfirmDialogProps {
  title: string
  /** «Dejas de ver / No te llevas / Se conserva»: what happens, in neutral words. */
  rows: { k: string; v: string }[]
  confirmLabel: string
  /** The safe button's words (it keeps the first focus); «Cancelar» unless the confirmation itself says that word (specs/033: «Cancelar cita» → «Volver»). */
  cancelLabel?: string
  busyLabel: string
  /** `danger` (red, «Quitar a Rosa») or `ink` (leaving: not an error, the system's last-resort button). */
  tone: 'danger' | 'ink'
  busy: boolean
  /** A sentence when the server refused or the network failed. */
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  /** The button that opened this: focus goes back to it (Safari doesn't focus a clicked button). */
  opener: RefObject<HTMLElement | null>
}

/**
 * The confirmation of leaving or removing someone from the family (mock «Familia», D1/D2): neutral words — what stops, what is
 * not taken, what stays; no advice (Principio I). On the phone a sheet anchored to the bottom with the buttons stacked (the
 * confirmation above, «Cancelar» below); on the web centered at 560 px with the actions at the right. A real dialog like the
 * others: rendered into <body>, Escape and the backdrop cancel (not while it works), focus starts on «Cancelar» (the safe
 * choice) and Tab stays inside.
 */
export function ConfirmDialog({ title, rows, confirmLabel, cancelLabel = 'Cancelar', busyLabel, tone, busy, error, onConfirm, onCancel, opener }: ConfirmDialogProps) {
  const id = useId()
  const desktop = useIsDesktop()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
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
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      restoreTo?.focus()
    }
  }, [onCancel, opener])

  const confirmClass = tone === 'danger' ? 'bg-red-700 hover:opacity-90' : 'bg-ink hover:opacity-90'
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex bg-ink/70 ${desktop ? 'items-center justify-center p-6' : 'items-end p-4'}`}
      onClick={() => !busy && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className={`flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-3xl bg-surface shadow-2xl ${desktop ? 'max-w-[560px] p-7' : 'p-6 pb-7'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${id}-title`} className="mt-2 text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCancel}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[26px] leading-none font-bold text-ink transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div id={`${id}-body`} className="flex flex-col gap-4">
          {rows.map((r) => (
            <div key={r.k} className="flex flex-col gap-0.5">
              <span className="text-[13px] font-bold text-ink">{r.k}</span>
              <span className={`leading-normal text-body ${desktop ? 'text-base' : 'text-[15px]'}`}>{r.v}</span>
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className={`mt-1.5 flex gap-3 ${desktop ? 'justify-end' : 'flex-col-reverse gap-2.5'}`}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`min-h-12 cursor-pointer rounded-2xl border-2 border-action text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${desktop ? 'px-6' : ''}`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-12 cursor-pointer rounded-2xl text-base font-extrabold text-white transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass} ${desktop ? 'px-6' : 'w-full'}`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
