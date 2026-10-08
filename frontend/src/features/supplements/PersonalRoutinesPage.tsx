import { useLocalDay } from '../../shared/useLocalDay'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { usePersonalRoutines } from './hooks'
import { MisRegistroSeccion } from './MisRegistroSeccion'
import { PersonalActivitiesPanel } from './PersonalActivitiesPanel'
import { PersonalTodayPanel } from './PersonalTodayPanel'
import { RoutinePageFrame } from './RoutineFormPage'
import { SECTION_COPY } from './sectionCopy'
import type { RoutineKind } from './types'

/**
 * `/mis-suplementos` and `/mis-actividades` —the person's own, each on its own page (specs/033 part 3, specs/035; mocks P3 and P4),
 * in two designs: the phone's one column, and the web's section at the left with «Tus tomas de hoy» or «Tus actividades de hoy» at
 * the right. Inside the app's shell, but it is not a child's screen: no child is highlighted in the sidebar.
 */
export function PersonalRoutinesPage({ kind }: { kind: RoutineKind }) {
  const { isDesktop } = useSidebarSession()
  const day = useLocalDay()
  const account = useCurrentAccount().data
  const routines = usePersonalRoutines(account?.id, kind, day).data?.routines ?? []
  const hasActive = routines.some((r) => r.status === 'active')

  return (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={undefined}
      backLabel="← Tus hijos"
      backTo="/home"
      eyebrow="Personal"
      title={SECTION_COPY[kind].personalTitle}
    >
      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-7">
          <MisRegistroSeccion kind={kind} />
          {hasActive && (kind === 'activity' ? <PersonalActivitiesPanel routines={routines} /> : <PersonalTodayPanel routines={routines} />)}
        </div>
      ) : (
        <MisRegistroSeccion kind={kind} />
      )}
    </RoutinePageFrame>
  )
}
