import { Link } from 'react-router-dom'
import { useLocalDay } from '../../shared/useLocalDay'
import type { Account } from '../home/types'
import { usePersonalRoutines } from './hooks'
import { PERSONAL_PRIVACY } from './MisSuplementosSeccion'
import { PersonalTodayPanel } from './PersonalTodayPanel'

/**
 * «Personal · Mis suplementos» on the home (specs/033, part 3; mock I1/I2/T1), below the children and set apart by its own title and
 * a line: the person's own routines are never mixed with a child's. With routines: «Tus tomas de hoy» and the way in; with none:
 * a dashed entry. If the list can't be read the block simply isn't drawn (the home never breaks for it).
 */
export function PersonalHomeBlock({ account, variant }: { account: Account | undefined; variant: 'phone' | 'desktop' }) {
  const day = useLocalDay()
  const query = usePersonalRoutines(account?.id, day)
  const list = query.data
  if (!account || !list) return null

  const hasRoutines = list.routines.length > 0
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
      <div className="flex flex-col gap-1">
        <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Personal</p>
        <h2 id="personal-home-title" className="text-xl font-black tracking-[-0.02em] text-ink">
          Mis suplementos
        </h2>
        <p className="text-sm leading-normal text-body">{PERSONAL_PRIVACY}</p>
      </div>
      {hasRoutines ? (
        <>
          <PersonalTodayPanel routines={list.routines} className="p-4" />
          <Link
            to="/mis-suplementos"
            className="inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Ver mis suplementos →
          </Link>
        </>
      ) : (
        <Link
          to="/mis-suplementos"
          className="flex min-h-16 flex-col justify-center gap-0.5 rounded-[22px] border-2 border-dashed border-hint-border px-5 py-3.5 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          <span className="text-base font-extrabold text-action">Ver mis suplementos →</span>
          <span className="text-sm leading-snug text-body">Para registrar lo que tomas tú, con su horario.</span>
        </Link>
      )}
    </section>
  )
}
