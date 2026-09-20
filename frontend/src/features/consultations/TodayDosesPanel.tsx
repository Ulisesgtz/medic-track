import { formatTime } from '../../shared/date'
import { useDoseToggle } from './useDoseToggle'
import type { OverviewDose } from './types'

interface DoseRowProps {
  dose: OverviewDose
}

/**
 * One of today's doses: "16:00 Amoxicilina" and a chip that marks it taken
 * (or, if it already is, unmarks it — same freedom as the consultation
 * detail, FR-016 of specs/004). Amber = "the parent hasn't marked it",
 * never a medical alert (Principio I).
 */
function DoseRow({ dose }: DoseRowProps) {
  const time = formatTime(dose.scheduledAt)
  const mutation = useDoseToggle(dose.consultationId, dose.id)

  return (
    <li className="flex min-h-11 items-center justify-between gap-3">
      <span className="min-w-0 truncate text-[15px] font-bold text-ink">
        {time} {dose.medicationName}
      </span>
      <button
        type="button"
        // A toggle: the name stays put and only aria-pressed carries the state
        // (a name that also changed would be announced twice, contradicting itself).
        aria-pressed={dose.taken}
        aria-label={`Toma de ${time} ${dose.medicationName}`}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(!dose.taken)}
        className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-action [&:focus-visible>span]:ring-offset-2"
      >
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center rounded-[10px] px-3 py-2 text-[13px] font-extrabold transition-colors duration-200 ${
            dose.taken
              ? 'bg-confirmed text-white'
              : 'border-[1.5px] border-pending bg-pending-soft text-[#92400e]'
          }`}
        >
          {dose.taken ? 'Tomada' : 'Marcar'}
        </span>
      </button>
    </li>
  )
}

interface TodayDosesPanelProps {
  doses: OverviewDose[]
  /** Overview still loading, or it failed: shown instead of the list. */
  status: 'ready' | 'loading' | 'error'
  className?: string
}

/** The "Tomas de hoy" panel of the desktop child detail (board screen 6): today's doses, markable in place. */
export function TodayDosesPanel({ doses, status, className = '' }: TodayDosesPanelProps) {
  return (
    <section
      aria-labelledby="today-doses-title"
      className={`rounded-[20px] bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${className}`}
    >
      <h2 id="today-doses-title" className="text-lg font-black tracking-[-0.02em] text-ink">
        Tomas de hoy
      </h2>
      {status === 'loading' && <p className="mt-4 text-[15px] text-slate-600">Cargando…</p>}
      {status === 'error' && (
        <p className="mt-4 text-[15px] text-slate-600">No se pudieron cargar las tomas de hoy.</p>
      )}
      {status === 'ready' && doses.length === 0 && (
        <p className="mt-4 text-[15px] text-slate-600">No hay tomas programadas para hoy.</p>
      )}
      {status === 'ready' && doses.length > 0 && (
        <ul className="mt-3 flex flex-col">
          {doses.map((dose) => (
            <DoseRow key={dose.id} dose={dose} />
          ))}
        </ul>
      )}
    </section>
  )
}
