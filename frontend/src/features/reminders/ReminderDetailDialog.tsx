import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReminderDetail } from './api'

interface ReminderDetailDialogProps {
  /** Name used in the "detailed" example (the account's first child). */
  childName: string
  current: ReminderDetail | null
  onChoose: (detail: ReminderDetail) => void
  onCancel: () => void
}

/**
 * What the reminders show (specs/011, FR-008): asked the first time the account turns reminders
 * on, and when the tutor taps "Cambiar". Each option shows how the reminder will look on the lock
 * screen, where anyone can read it. A real dialog: rendered into <body>, Escape and the backdrop
 * cancel, focus starts on the first option and Tab stays inside.
 */
export function ReminderDetailDialog({ childName, current, onChoose, onCancel }: ReminderDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
    focusables()[0]?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      opener?.focus()
    }
  }, [onCancel])

  const options: { value: ReminderDetail; label: string; example: string; note: string }[] = [
    {
      value: 'detailed',
      label: 'Mostrar detalle',
      example: `Amoxicilina · 8:00 · ${childName}`,
      note: 'Cualquiera que vea tu pantalla bloqueada podrá leer el medicamento y el nombre.',
    },
    {
      value: 'generic',
      label: 'Texto genérico',
      example: 'Hay una toma programada · 8:00',
      note: 'No muestra el medicamento ni el nombre; lo ves al abrir la app.',
    },
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-detail-title"
        aria-describedby="reminder-detail-body"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reminder-detail-title" className="text-2xl font-black tracking-tight text-ink">
          ¿Qué muestran los avisos?
        </h2>
        <p id="reminder-detail-body" className="mt-2 text-sm leading-relaxed text-slate-600">
          Los avisos se ven en la pantalla bloqueada. Elige qué quieres que digan; puedes cambiarlo cuando quieras.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={current === option.value}
              onClick={() => onChoose(option.value)}
              className={`flex min-h-11 cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 text-left transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 ${
                current === option.value ? 'border-action bg-hint' : 'border-slate-300 bg-surface'
              }`}
            >
              <span className="text-base font-extrabold text-ink">{option.label}</span>
              <span className="rounded-xl bg-ink px-3 py-2 text-[13px] leading-snug text-white">
                <span className="block font-extrabold">Toma programada</span>
                {option.example}
              </span>
              <span className="text-[13px] leading-relaxed text-slate-600">{option.note}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 cursor-pointer rounded-2xl px-5 py-2.5 text-[15px] font-extrabold text-action hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
