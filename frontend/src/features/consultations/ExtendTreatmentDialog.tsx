import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { formatDayMonth } from '../../shared/date'
import { MAX_EXTENSION_DOSES, parseDoses } from './treatmentDays'

interface ExtendTreatmentDialogProps {
  medicationName: string
  frequencyHours: number
  /** The scheduled instant of the medication's last dose: the added ones come after it. */
  lastDoseAt: string
  /** What the app proposes: the unregistered doses not covered yet. */
  proposed: number
  busy: boolean
  /** A sentence when the server refused or the network failed. */
  error: string | null
  onConfirm: (doses: number) => void
  onCancel: () => void
  /** The button that opened this: focus goes back to it (Safari doesn't focus a clicked button). */
  opener: RefObject<HTMLElement | null>
}

/**
 * Confirmation to extend a treatment (specs/020): the parent adds doses to the end only because their doctor said so.
 * The app proposes the number of unregistered doses; the parent can confirm it or type another, and the dialog says
 * that a number of their own is recorded as typed by them. Neutral text — it asks, it never suggests (Principio I) — and
 * it says it is recorded and can't be undone. A real dialog like the others: a portal, Escape and the backdrop cancel
 * (not while it is sending), focus starts on "Cancelar" (the safe choice) and Tab stays inside.
 */
export function ExtendTreatmentDialog({
  medicationName,
  frequencyHours,
  lastDoseAt,
  proposed,
  busy,
  error,
  onConfirm,
  onCancel,
  opener,
}: ExtendTreatmentDialogProps) {
  const [text, setText] = useState(String(proposed))
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // While the request runs nothing closes the dialog (Escape and the backdrop included): the outcome must be seen.
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  })
  const fieldId = useId()
  const hintId = useId()

  const doses = parseDoses(text)
  const changed = doses !== null && doses !== proposed
  const until = doses !== null ? new Date(new Date(lastDoseAt).getTime() + doses * frequencyHours * 3_600_000) : null

  useEffect(() => {
    const restoreTo = opener.current
    cancelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busyRef.current) onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, button:not([disabled])') ?? [])
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={() => !busy && onCancel()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="extend-treatment-title"
        aria-describedby="extend-treatment-body"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="extend-treatment-title" className="text-2xl font-black tracking-tight text-ink">
          ¿Recorrer el tratamiento de {medicationName}?
        </h2>
        <p id="extend-treatment-body" className="mt-3 text-base leading-relaxed text-body">
          ¿Tu médico te indicó reponer las tomas?{' '}
          {proposed === 1 ? 'La toma sin registrar se conserva.' : `Las ${proposed} tomas sin registrar se conservan.`}{' '}
          Esto queda registrado en tu cuenta. No se puede deshacer.
        </p>

        <label htmlFor={fieldId} className="mt-5 block text-sm font-extrabold text-ink">
          Tomas a agregar
        </label>
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          aria-invalid={doses === null}
          aria-describedby={hintId}
          className={`mt-1.5 min-h-11 w-28 rounded-xl border-2 px-3 text-base font-bold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${
            doses === null ? 'border-red-700' : 'border-hint-border'
          }`}
        />
        <p id={hintId} className="mt-1.5 text-[13px] font-semibold text-slate-600">
          {doses === null ? (
            <span role="alert" className="text-red-700">
              Escribe un número entero de 1 a {MAX_EXTENSION_DOSES}.
            </span>
          ) : (
            <>Quedaría hasta el {formatDayMonth(until!)}.</>
          )}
        </p>
        {changed && (
          <p role="status" className="mt-2 text-[13px] font-bold text-ink-soft">
            Cambiaste el número propuesto: quedará registrado que lo ingresaste tú manualmente.
          </p>
        )}

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
            type="button"
            onClick={() => doses !== null && onConfirm(doses)}
            disabled={busy || doses === null}
            className="min-h-11 cursor-pointer rounded-2xl bg-ink px-5 py-3 text-[15px] font-extrabold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Recorriendo…' : 'Sí, recorrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
