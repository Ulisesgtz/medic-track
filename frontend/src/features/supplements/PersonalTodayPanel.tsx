import { formatTime } from '../../shared/date'
import { RoutineDoseChip } from './RoutineDoseChip'
import type { Routine, RoutineDose } from './types'

/** One dose of today of one of the person's own active routines. */
interface TodayItem {
  routine: Routine
  dose: RoutineDose
}

/** Today's doses of the person's own ACTIVE routines, by time (a paused or finished routine has none to show). */
export function personalTodayItems(routines: Routine[]): TodayItem[] {
  return routines
    .filter((r) => r.status === 'active')
    .flatMap((routine) => routine.doses.map((dose) => ({ routine, dose })))
    .sort((a, b) => new Date(a.dose.scheduledAt).getTime() - new Date(b.dose.scheduledAt).getTime())
}

/**
 * «1 sin marcar» / «todo marcado hasta ahora»: only what the person marked or not — plain text, never an amber card and never a
 * judgement (the amber stays on the chip of the dose that is «por marcar»).
 */
export function personalTodaySummary(items: TodayItem[]): string {
  const unmarked = items.filter((i) => !i.dose.taken && i.dose.status === 'due').length
  return unmarked === 0 ? 'todo marcado hasta ahora' : `${unmarked} sin marcar`
}

/**
 * «Tus tomas de hoy» (mock TomasHoyPanel with its own title): the doses of today of the person's own routines, markable in place
 * with the same chip — «✓ a las 07:20» once taken, since only they can mark it. Apart from the children's panel on purpose.
 */
export function PersonalTodayPanel({ routines, className = '' }: { routines: Routine[]; className?: string }) {
  const items = personalTodayItems(routines)
  return (
    <section aria-labelledby="personal-today-title" className={`rounded-[20px] bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="personal-today-title" className="text-lg font-black tracking-[-0.02em] text-ink">
          Tus tomas de hoy
        </h2>
        {items.length > 0 && <span className="text-sm font-bold text-slate-600">{personalTodaySummary(items)}</span>}
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-[15px] text-slate-600">No hay tomas programadas para hoy.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map(({ routine, dose }) => (
            <li key={dose.id} className="flex min-h-11 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] font-bold text-ink">
                <span className="sr-only">{formatTime(dose.scheduledAt)} </span>
                {routine.name}
              </span>
              <span className="flex shrink-0">
                <RoutineDoseChip routineId={routine.id} dose={dose} own />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
