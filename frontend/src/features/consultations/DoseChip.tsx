import { useId } from 'react'
import { formatTime } from '../../shared/date'
import { CALENDAR_CHIP_NOTE, CALENDAR_CHIP_STYLE, CANCELED_LABEL, DOSE_CHIP_STYLE, UNREGISTERED_LABEL, statusOf } from './doseStatus'
import type { Dose } from './types'
import { useDoseToggle } from './useDoseToggle'

/**
 * One dose as a time chip (mockups 03/13), by the status the server sends (specs/013): "08:00 ✓" taken (green), amber
 * while it's "por marcar", grey while it hasn't come, and "sin registrar" — dashed border and those words under the
 * time — once the next dose of its medication came unmarked. Always enabled: the parent can mark or correct any dose.
 * A toggle: fixed name ("Toma de 08:00", or `label` when the same dose is shown twice — specs/019's day list names it after its medication), marked only in aria-pressed; "sin registrar" is its description.
 */
interface DoseChipProps {
  consultationId: string
  dose: Dose
  label?: string
  /** `calendar`: the chip of the treatment calendar's day list (specs/022), a fixed width (160 px on the web, 130 on the phone). */
  appearance?: 'default' | 'calendar'
  desktop?: boolean
  /** The next dose to come: its second line says "próxima". */
  next?: boolean
}

export function DoseChip({ consultationId, dose, label, appearance = 'default', desktop = false, next = false }: DoseChipProps) {
  const mutation = useDoseToggle(consultationId, dose.id)
  const time = formatTime(dose.scheduledAt)
  const status = statusOf(dose)
  const unregistered = status === 'unregistered'
  const canceled = status === 'canceled'
  const stateId = `${useId()}-state`

  const calendar = appearance === 'calendar'
  const hasState = unregistered || canceled
  // The second line: the calendar's chip says it for every status ("próxima" only for the next pending dose); the default one only for the two states without a mark.
  const second = calendar
    ? status === 'pending'
      ? next
        ? 'próxima'
        : null
      : CALENDAR_CHIP_NOTE[status]
    : canceled
      ? 'cancelada'
      : unregistered
        ? 'sin registrar'
        : null
  const shape = calendar
    ? `box-border min-h-11 shrink-0 rounded-xl border-[1.5px] text-center ${desktop ? 'w-40 p-[7px]' : 'w-[130px] p-2'} ${CALENDAR_CHIP_STYLE[status]}`
    : `flex min-h-11 min-w-[76px] max-w-40 flex-1 flex-col items-center justify-center rounded-xl text-sm font-extrabold ${hasState ? 'py-1.5 leading-tight' : 'py-3'} ${DOSE_CHIP_STYLE[status]}`
  const timeClass = calendar ? `block leading-tight font-black ${desktop ? 'text-[15px]' : 'text-base'}` : ''

  return (
    <button
      type="button"
      aria-pressed={dose.taken}
      aria-label={label ?? `Toma de ${time}`}
      aria-describedby={hasState ? stateId : undefined}
      disabled={mutation.isPending || canceled}
      onClick={() => mutation.mutate(!dose.taken)}
      className={`cursor-pointer transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${canceled ? 'disabled:opacity-100' : ''} ${shape}`}
    >
      <span className={`${timeClass} ${canceled ? 'line-through' : ''}`.trim() || undefined}>
        {calendar && dose.taken ? '✓ ' : ''}
        {time}
        {!calendar && dose.taken ? ' ✓' : ''}
      </span>
      {second && (
        <span
          aria-hidden={hasState ? true : undefined}
          className={calendar ? 'block text-xs leading-tight font-bold' : 'text-xs font-bold text-slate-600'}
        >
          {second}
        </span>
      )}
      {hasState && (
        <span id={stateId} className="sr-only">
          {canceled ? CANCELED_LABEL : UNREGISTERED_LABEL}
        </span>
      )}
    </button>
  )
}
