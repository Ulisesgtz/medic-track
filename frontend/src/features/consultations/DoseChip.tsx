import { useId } from 'react'
import { formatTime } from '../../shared/date'
import { CANCELED_LABEL, DOSE_CHIP_STYLE, UNREGISTERED_LABEL, statusOf } from './doseStatus'
import type { Dose } from './types'
import { useDoseToggle } from './useDoseToggle'

/**
 * One dose as a time chip (mockups 03/13), by the status the server sends (specs/013): "08:00 ✓" taken (green), amber
 * while it's "por marcar", grey while it hasn't come, and "sin registrar" — dashed border and those words under the
 * time — once the next dose of its medication came unmarked. Always enabled: the parent can mark or correct any dose.
 * A toggle: fixed name ("Toma de 08:00", or `label` when the same dose is shown twice — specs/019's day list names it after its medication), marked only in aria-pressed; "sin registrar" is its description.
 */
export function DoseChip({ consultationId, dose, label }: { consultationId: string; dose: Dose; label?: string }) {
  const mutation = useDoseToggle(consultationId, dose.id)
  const time = formatTime(dose.scheduledAt)
  const status = statusOf(dose)
  const unregistered = status === 'unregistered'
  const canceled = status === 'canceled'
  const stateId = `${useId()}-state`

  return (
    <button
      type="button"
      aria-pressed={dose.taken}
      aria-label={label ?? `Toma de ${time}`}
      aria-describedby={unregistered || canceled ? stateId : undefined}
      disabled={mutation.isPending || canceled}
      onClick={() => mutation.mutate(!dose.taken)}
      className={`flex min-h-11 min-w-[76px] max-w-40 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl text-sm font-extrabold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        unregistered || canceled ? 'py-1.5 leading-tight' : 'py-3'
      } ${canceled ? 'disabled:opacity-100' : ''} ${DOSE_CHIP_STYLE[status]}`}
    >
      <span className={canceled ? 'line-through' : undefined}>
        {time}
        {dose.taken ? ' ✓' : ''}
      </span>
      {(unregistered || canceled) && (
        <>
          <span aria-hidden="true" className="text-xs font-bold text-slate-600">
            {canceled ? 'cancelada' : 'sin registrar'}
          </span>
          <span id={stateId} className="sr-only">
            {canceled ? CANCELED_LABEL : UNREGISTERED_LABEL}
          </span>
        </>
      )}
    </button>
  )
}
