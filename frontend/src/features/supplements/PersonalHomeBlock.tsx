import { Link } from 'react-router-dom'
import { useLocalDay } from '../../shared/useLocalDay'
import type { Account } from '../home/types'
import { usePersonalRoutines } from './hooks'
import { PersonalActivitiesPanel } from './PersonalActivitiesPanel'
import { PersonalTodayPanel } from './PersonalTodayPanel'

const entry =
  'flex min-h-16 flex-col justify-center gap-0.5 rounded-[22px] border-2 border-dashed border-hint-border px-5 py-3.5 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'
const more =
  'inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

/**
 * «Personal · solo lo ves tú» on the home (specs/033 part 3, specs/035; mocks P1/P2), below the children and set apart by its own
 * title and a line: the person's own are never mixed with a child's. Inside, «Mis suplementos» (the panel «Tus tomas de hoy») and
 * «Mis actividades» (the panel «Tus actividades de hoy»); each with none is a dashed entry. If neither list can be read the block
 * simply isn't drawn (the home never breaks for it).
 */
export function PersonalHomeBlock({ account, variant }: { account: Account | undefined; variant: 'phone' | 'desktop' }) {
  const day = useLocalDay()
  const supplements = usePersonalRoutines(account?.id, 'supplement', day).data
  const activities = usePersonalRoutines(account?.id, 'activity', day).data
  if (!account || (!supplements && !activities)) return null

  const desktop = variant === 'desktop'
  return (
    <section
      aria-labelledby="personal-home-title"
      className={
        desktop
          ? 'flex min-w-0 flex-col gap-3.5 rounded-[22px] border-2 border-hint-border p-6'
          : 'mt-6 flex flex-col gap-3 border-t-2 border-hint-border pt-6'
      }
    >
      <p id="personal-home-title" className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">
        Personal · solo lo ves tú
      </p>

      {supplements && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-black tracking-[-0.02em] text-ink">Mis suplementos</h2>
          {supplements.routines.length > 0 ? (
            <>
              <PersonalTodayPanel routines={supplements.routines} className="p-4" />
              <Link to="/mis-suplementos" className={more}>
                Ver mis suplementos →
              </Link>
            </>
          ) : (
            <Link to="/mis-suplementos" className={entry}>
              <span className="text-base font-extrabold text-action">Ver mis suplementos →</span>
              <span className="text-sm leading-snug text-body">Para lo que tomas tú a horas fijas.</span>
            </Link>
          )}
        </div>
      )}

      {activities && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-black tracking-[-0.02em] text-ink">Mis actividades</h2>
          {activities.routines.length > 0 ? (
            <>
              <PersonalActivitiesPanel routines={activities.routines} className="p-4" />
              <Link to="/mis-actividades" className={more}>
                Ver mis actividades →
              </Link>
            </>
          ) : (
            <Link to="/mis-actividades" className={entry}>
              <span className="text-base font-extrabold text-action">Ver mis actividades →</span>
              <span className="text-sm leading-snug text-body">Para lo que haces tú varias veces al día.</span>
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
