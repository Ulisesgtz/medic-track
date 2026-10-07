import { Link } from 'react-router-dom'
import { RoutineDoseChip } from './RoutineDoseChip'
import { cardProgress, endedCardText, noTodayText, pausedCardText, periodText, rangeText } from './scheduleText'
import type { Routine, RoutineStatus } from './types'

/** The routine's status chip: «Activa» in the hint colors, «Pausada» and «Terminada» in slate — never green or amber (those are for the doses). */
export function RoutineStatusChip({ status }: { status: RoutineStatus }) {
  if (status === 'active') {
    return (
      <span className="shrink-0 rounded-full border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-xs font-extrabold tracking-[0.08em] text-action uppercase">
        Activa
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold tracking-[0.08em] text-slate-600 uppercase">
      {status === 'paused' ? 'Pausada' : 'Terminada'}
    </span>
  )
}

interface RoutineCardProps {
  routine: Routine
  /** The parent's local today as "YYYY-MM-DD". */
  today: string
  /** Whether the session can take back a mark somebody else made. */
  canManage: boolean
}

/**
 * One routine in the child's «Suplementos» section (mock RutinaTarjeta): name, status, how often and for how long, the
 * progress, today's doses as chips (or when the next one is) and the link to its detail. Long names wrap (`overflow-wrap`).
 */
export function RoutineCard({ routine, today, canManage }: RoutineCardProps) {
  const own = routine.childId === null
  const path = `/suplementos/${routine.id}`
  const progress = cardProgress(routine, today)
  const showToday = routine.status === 'active' && routine.doses.length > 0
  const noToday = routine.status === 'active' && routine.doses.length === 0 && routine.nextDose

  return (
    <article className="flex flex-col gap-3 rounded-[22px] bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <Link
          to={path}
          className="min-w-0 flex-[1_1_180px] text-[19px] leading-tight font-extrabold tracking-[-0.02em] text-ink [overflow-wrap:anywhere] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          {routine.name}
        </Link>
        <RoutineStatusChip status={routine.status} />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-base font-bold text-ink">{periodText(routine)}</p>
        <p className="text-sm font-medium text-slate-600">{rangeText(routine)}</p>
      </div>
      {progress && (
        <div className="flex flex-col gap-1.5">
          {progress.pct !== null && (
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-hint-edge">
              <div className="h-full rounded-full bg-bright" style={{ width: `${progress.pct}%` }} />
            </div>
          )}
          <p className="text-sm font-bold text-body">{progress.text}</p>
        </div>
      )}
      {showToday && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Hoy</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
            {routine.doses.map((dose) => (
              <RoutineDoseChip key={dose.id} routineId={routine.id} dose={dose} canManage={canManage} own={own} />
            ))}
          </div>
        </div>
      )}
      {noToday && routine.nextDose && (
        <p className="rounded-[14px] bg-hint px-3.5 py-3 text-sm leading-normal font-semibold text-body">
          {noTodayText(routine.nextDose.scheduledAt, today)}
        </p>
      )}
      {routine.status === 'paused' && routine.pausedAt && (
        <p className="text-sm leading-normal text-body">{pausedCardText(routine.pausedAt)}</p>
      )}
      {routine.status === 'ended' && routine.endedAt && (
        <p className="text-[15px] font-bold text-ink">{endedCardText(routine.endedAt, routine.progress.taken, routine.progress.total)}</p>
      )}
      <Link
        to={path}
        aria-label={`Ver rutina ${routine.name}`}
        className="inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
      >
        Ver rutina →
      </Link>
    </article>
  )
}
