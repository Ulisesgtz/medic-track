import { Link } from 'react-router-dom'
import { DayProgress } from './DayProgress'
import { RealizadoButton } from './RealizadoButton'
import { RoutineStatusChip } from './RoutineStatusChip'
import { cardClass, cardLinkClass, cardNameClass } from './SuplementoTarjeta'
import { activityRange, activityRule, dayCount, endedCardText, lastMarked, nextUnmarked, noTodayText, pausedCardText } from './scheduleText'
import type { Routine } from './types'

/** «Próxima: 15:00» (or «Sin más avisos hoy») and «Última: por Ana, 14:05» (the person's own: «Última: 14:02»). */
export function ActivityLines({ routine, own, now }: { routine: Routine; own: boolean; now?: Date }) {
  const next = nextUnmarked(routine.doses, now)
  const last = lastMarked(routine.doses)
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm font-semibold text-body">
      <span>{next ? `Próxima: ${next}` : 'Sin más avisos hoy'}</span>
      {last && <span>{own ? `Última: ${last.at}` : `Última: por ${last.by}, ${last.at}`}</span>}
    </div>
  )
}

/**
 * One activity in the «Actividades» section (mock ActividadTarjeta): name and status, «Cada hora, de 08:00 a 20:00», the days and
 * dates, and — under a thin line — «6 de 13 hechas hoy» with the bar, the next and the last, and «✓ Realizado». There are NO chips,
 * hours or calendar: an activity can go off dozens of times a day and the card measures the same with 4 or with 24.
 */
export function ActividadTarjeta({ routine, today }: { routine: Routine; today: string }) {
  const own = routine.childId === null
  const path = `/actividades/${routine.id}`
  const count = dayCount(routine.doses)
  const showToday = routine.status === 'active' && routine.doses.length > 0
  const noToday = routine.status === 'active' && routine.doses.length === 0 && routine.nextDose

  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <Link to={path} className={cardNameClass}>
          {routine.name}
        </Link>
        <RoutineStatusChip kind="activity" status={routine.status} />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-base font-bold text-ink">{activityRule(routine)}</p>
        <p className="text-sm font-medium text-slate-600">{activityRange(routine)}</p>
      </div>
      {showToday && (
        <div className="flex flex-col gap-2.5 border-t border-hint-edge pt-3">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-black tracking-[-0.02em] text-ink tabular-nums">
              {count.done} de {count.total}
            </span>
            <span className="text-[15px] font-bold text-body">hechas hoy</span>
          </p>
          <DayProgress done={count.done} total={count.total} label={`${count.done} de ${count.total} hechas hoy`} />
          <ActivityLines routine={routine} own={own} />
          {count.done < count.total && <RealizadoButton routineId={routine.id} name={routine.name} className="mt-0.5 self-start" />}
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
      <Link to={path} aria-label={`Ver actividad ${routine.name}`} className={cardLinkClass}>
        Ver actividad →
      </Link>
    </article>
  )
}
