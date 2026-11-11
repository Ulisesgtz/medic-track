import { useId } from 'react'
import { formatTime } from '../../shared/date'
import { DETAIL, takenLine } from './consultationDetailText'
import { CANCELED_LABEL, UNREGISTERED_LABEL, canUnmarkDose, statusOf } from './doseStatus'
import type { Dose } from './types'
import { SavingHint } from '../../shared/marks/MarkNotice'
import { useDoseToggle } from './useDoseToggle'

const outline =
  'min-h-11 shrink-0 cursor-pointer rounded-[14px] border-2 border-action bg-transparent text-[15px] font-extrabold text-action hover:bg-hint disabled:cursor-default disabled:opacity-60'
const mint = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-confirmed-soft px-3 text-[14px] font-extrabold text-confirmed-strong'
const quiet = 'shrink-0 text-[14px] font-bold text-calendar-muted'

/** A padlock: a mark somebody else made, which only they (or who can do everything) take back. */
function Lock() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" className="stroke-current" strokeWidth="2.4" strokeLinecap="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

interface DoseRowProps {
  consultationId: string
  dose: Dose
  /** Who can do everything takes back anybody's mark (specs/032); otherwise only the mark's author. */
  canManage: boolean
  /** «Mañana» / «Tarde» / «Noche» on the first dose of its moment of the day; empty on the rest (design C). */
  group: string
  /** The chosen day comes after today: an unmarked dose there says «programada» and can still be marked (specs/056 FR-018). */
  future: boolean
  variant: 'phone' | 'desktop'
  /** The medication's name, for the notice of a mark that didn't get saved (specs/066). */
  medicationName?: string
}

/**
 * One dose of the day chosen in the calendar, inside its medication's card (specs/056, design «Detalle de la consulta», research
 * R7): the moment of the day, the hour and its state by the server's `status` — «por marcar» (amber), «sin registrar» (dashed,
 * never amber), «programada» (grey, a day still to come), «cancelada» (grey, hour struck through, no action) — and the toggle:
 * «Marcar», or «✓ 07:05 · por Ana» once marked; a mark the session can't take back carries a padlock and stays disabled. The
 * toggle keeps its fixed name («Toma de 08:00») with the state in `aria-pressed` and the rest in its description.
 */
export function DoseRow({ consultationId, dose, canManage, group, future, variant, medicationName }: DoseRowProps) {
  const mutation = useDoseToggle(consultationId, dose.id, { name: medicationName, scheduledAt: dose.scheduledAt })
  const time = formatTime(dose.scheduledAt)
  const status = statusOf(dose)
  const canceled = status === 'canceled'
  const unregistered = status === 'unregistered'
  const locked = !canUnmarkDose(dose, canManage)
  const stateId = `${useId()}-state`
  const desktop = variant === 'desktop'
  const state = canceled
    ? CANCELED_LABEL
    : dose.taken
      ? `Marcada ${takenLine(dose.takenBy, dose.scheduledAt).replace('✓ ', '')}`
      : unregistered
        ? UNREGISTERED_LABEL
        : status === 'due'
          ? 'Por marcar'
          : future
            ? 'Programada'
            : ''

  const toMark = !dose.taken && status === 'due' && (
    <span className="self-start rounded-full bg-pending-soft px-2 py-px text-[12px] font-extrabold text-on-pending-chip">{DETAIL.toMark}</span>
  )
  const action = canceled ? (
    <span className={quiet}>{DETAIL.canceled}</span>
  ) : (
    <>
      {!dose.taken && unregistered && (
        <span className="shrink-0 rounded-full border-[1.5px] border-dashed border-calendar-muted px-2.5 py-1 text-[13px] font-extrabold text-body">{DETAIL.unregistered}</span>
      )}
      {!dose.taken && !unregistered && status !== 'due' && future && <span className={quiet}>{DETAIL.scheduled}</span>}
      <SavingHint doseId={dose.id} className="shrink-0" />
      <button
        type="button"
        aria-pressed={dose.taken}
        aria-label={`Toma de ${time}`}
        aria-describedby={state ? stateId : undefined}
        disabled={locked}
        title={locked ? 'Solo quien la marcó o un Tutor puede quitar esta marca' : undefined}
        onClick={() => mutation.mutate(!dose.taken)}
        className={dose.taken ? `${mint} ${locked ? 'cursor-default' : 'cursor-pointer'}` : `${outline} ${desktop ? 'min-w-24 px-[18px]' : 'min-w-[92px] px-4'}`}
      >
        {dose.taken && locked && <Lock />}
        {dose.taken ? takenLine(dose.takenBy, dose.scheduledAt) : DETAIL.mark}
      </button>
    </>
  )
  const hour = (
    <span className={`font-extrabold ${canceled ? 'text-calendar-muted line-through' : future && !dose.taken ? 'text-calendar-muted' : 'text-ink'} ${desktop ? 'w-16 shrink-0 text-[17px]' : 'text-[16px]'}`}>
      {time}
    </span>
  )

  return (
    <li className={`flex min-h-[52px] flex-wrap items-center ${desktop ? 'gap-3.5 border-b border-hint-edge' : 'gap-2.5'}`}>
      <span aria-hidden="true" className={`shrink-0 font-extrabold tracking-[0.06em] text-action uppercase ${desktop ? 'w-[76px] text-[12px]' : 'w-[58px] text-[11px]'}`}>
        {group}
      </span>
      {desktop ? (
        <>
          {hour}
          <span className="min-w-0 flex-1">{toMark}</span>
        </>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {hour}
          {toMark}
        </span>
      )}
      {action}
      {state && (
        <span id={stateId} className="sr-only">
          {state}
        </span>
      )}
    </li>
  )
}
