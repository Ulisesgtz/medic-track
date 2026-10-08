import { Link } from 'react-router-dom'
import { DayProgress } from './DayProgress'
import { RoutineDoseChip } from './RoutineDoseChip'
import { RoutineStatusChip } from './RoutineStatusChip'
import { dayCount, endedCardText, noTodayText, pausedCardText, rangeText, supplementPeriodText } from './scheduleText'
import type { Routine } from './types'

export const cardClass = 'flex flex-col gap-3.5 rounded-[22px] bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
export const cardNameClass =
  'min-w-0 flex-[1_1_180px] text-[19px] leading-tight font-extrabold tracking-[-0.02em] text-ink [overflow-wrap:anywhere] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'
export const cardLinkClass =
  'inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

interface SuplementoTarjetaProps {
  routine: Routine
  /** The parent's local today as "YYYY-MM-DD". */
  today: string
  /** Whether the session can take back a mark somebody else made. */
  canManage: boolean
}

/**
 * One supplement in the «Suplementos» section (mock SuplementoTarjeta): name and status, «Todos los días · 6 tomas», the dates,
 * and — under a thin line — «2 de 6 tomas hoy» with the bar and today's doses as chips. The hours are not written again: each
 * chip carries its own. Long names wrap (`overflow-wrap`).
 */
export function SuplementoTarjeta({ routine, today, canManage }: SuplementoTarjetaProps) {
  const own = routine.childId === null
  const path = `/suplementos/${routine.id}`
  const count = dayCount(routine.doses)
  const showToday = routine.status === 'active' && routine.doses.length > 0
  const noToday = routine.status === 'active' && routine.doses.length === 0 && routine.nextDose

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <Link to={path} className={cardNameClass}>
          {routine.name}
        </Link>
        <RoutineStatusChip kind="supplement" status={routine.status} />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-base font-bold text-ink">{supplementPeriodText(routine)}</p>
        <p className="text-sm font-medium text-slate-600">{rangeText(routine)}</p>
      </div>
      {showToday && (
        <div className="flex flex-col gap-2.5 border-t border-hint-edge pt-3">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-black tracking-[-0.02em] text-ink tabular-nums">
              {count.done} de {count.total}
            </span>
            <span className="text-[15px] font-bold text-body">tomas hoy</span>
          </p>
          <DayProgress done={count.done} total={count.total} label={`${count.done} de ${count.total} tomas hoy`} />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2 pt-0.5">
            {routine.doses.map((dose) => (
              <RoutineDoseChip key={dose.id} routineId={routine.id} dose={dose} canManage={canManage} own={own} />
            ))}
          </div>
        </div>
      )}
      {noToday && routine.nextDose && (
        <p className="rounded-[14px] bg-hint px-3.5 py-3 text-sm leading-normal font-semibold text-body">
          {noTodayText(routine.nextDose.scheduledAt, today, own)}
        </p>
      )}
      {routine.status === 'paused' && routine.pausedAt && <p className="text-sm leading-normal text-body">{pausedCardText(routine, routine.pausedAt)}</p>}
      {routine.status === 'ended' && routine.endedAt && (
        <p className="text-[15px] font-bold text-ink">{endedCardText(routine, routine.endedAt, routine.progress.taken, routine.progress.total)}</p>
      )}
      <Link to={path} aria-label={`Ver suplemento ${routine.name}`} className={cardLinkClass}>
        Ver suplemento →
      </Link>
    </article>
  )
}
