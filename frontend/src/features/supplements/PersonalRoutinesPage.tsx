import { useLocalDay } from '../../shared/useLocalDay'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { usePersonalRoutines } from './hooks'
import { MisSuplementosSeccion } from './MisSuplementosSeccion'
import { PersonalTodayPanel } from './PersonalTodayPanel'
import { RoutinePageFrame } from './RoutineFormPage'

/**
 * `/mis-suplementos` — the person's own supplement routines (specs/033, part 3; mock S1…S4, A1…A3, G1/G2), in two designs: the phone's
 * one column, and the web's section at the left with «Tus tomas de hoy» at the right. Inside the app's shell, but it is not a
 * child's screen: no child is highlighted in the sidebar.
 */
export function PersonalRoutinesPage() {
  const { isDesktop } = useSidebarSession()
  const day = useLocalDay()
  const account = useCurrentAccount().data
  const routines = usePersonalRoutines(account?.id, day).data?.routines ?? []
  const hasActive = routines.some((r) => r.status === 'active')

  return (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={undefined}
      backLabel="← Tus hijos"
      backTo="/home"
      eyebrow="Personal"
      title="Mis suplementos"
    >
      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-7">
          <MisSuplementosSeccion />
          {hasActive && <PersonalTodayPanel routines={routines} />}
        </div>
      ) : (
        <MisSuplementosSeccion />
      )}
    </RoutinePageFrame>
  )
}
