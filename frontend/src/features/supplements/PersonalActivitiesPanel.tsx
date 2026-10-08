import { DayProgress } from './DayProgress'
import { RealizadoButton } from './RealizadoButton'
import { dayCount, nextUnmarked } from './scheduleText'
import type { Routine } from './types'

/** The person's own ACTIVE activities that go off today (the ones that don't, and the paused or finished, aren't in the panel). */
export function personalActivitiesToday(routines: Routine[]): Routine[] {
  return routines.filter((r) => r.status === 'active' && r.doses.length > 0)
}

/**
 * «Tus actividades de hoy» (mock P1): one row per activity of today — «N de M hechas hoy · Próxima: HH:MM», a thin bar and the
 * outline «✓ Realizado» — apart from the supplements' panel. It counts what was marked and says nothing about it (Principio I).
 */
export function PersonalActivitiesPanel({ routines, className = '' }: { routines: Routine[]; className?: string }) {
  const items = personalActivitiesToday(routines)
  return (
    <section aria-labelledby="personal-activities-title" className={`rounded-[20px] bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${className}`}>
      <h2 id="personal-activities-title" className="text-lg font-black tracking-[-0.02em] text-ink">
        Tus actividades de hoy
      </h2>
      {items.length === 0 ? (
        <p className="mt-4 text-[15px] text-slate-600">No hay actividades programadas para hoy.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {items.map((routine) => {
            const count = dayCount(routine.doses)
            const next = nextUnmarked(routine.doses)
            return (
              <li key={routine.id} className="flex flex-col gap-2">
                <span className="text-[15px] font-bold text-ink [overflow-wrap:anywhere]">{routine.name}</span>
                <span className="text-sm font-semibold text-body">
                  {count.done} de {count.total} hechas hoy · {next ? `Próxima: ${next}` : 'Sin más avisos hoy'}
                </span>
                <DayProgress thin done={count.done} total={count.total} label={`${routine.name}: ${count.done} de ${count.total} hechas hoy`} />
                {count.done < count.total && <RealizadoButton routineId={routine.id} name={routine.name} className="self-start" />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
