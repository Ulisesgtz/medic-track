import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { useLocalDay } from '../../shared/useLocalDay'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { AppShell } from '../home/AppShell'
import { PageHeader, type PageHeaderProps } from '../../shared/ui/PageHeader'
import { useSidebarSession } from '../home/useSidebarSession'
import { useCreatePersonalRoutine, useCreateRoutine, useRoutine, useUpdateRoutine } from './hooks'
import { RoutineForm } from './RoutineForm'
import type { RoutineInput, RoutineKind } from './types'

/**
 * The page frame of the secondary screens (routines, cartilla, appointments, plans): since specs/056 its header is the common
 * `PageHeader` (no dark band on the phone; the design «Encabezado PediTrack.dc.html»), so every screen that uses it changed at once.
 * The optional props are the header's (subtitle, status chip, actions, «Solo lectura», loading and error).
 */
export function RoutinePageFrame({
  isDesktop,
  childId,
  backLabel,
  backTo,
  backOnClick,
  eyebrow,
  title,
  children,
  maxWidth,
  subtitle,
  chip,
  actions,
  readOnly,
  state,
  errorWhat,
  onRetry,
}: {
  isDesktop: boolean
  childId: string | undefined
  backLabel: string
  backTo: string
  /** May stop the way back (a form with something typed asks first). */
  backOnClick?: PageHeaderProps['back']['onClick']
  eyebrow?: string
  title: ReactNode
  children: ReactNode
  /** The web's content column (the form is 640 px). */
  maxWidth?: string
} & Pick<PageHeaderProps, 'subtitle' | 'chip' | 'actions' | 'readOnly' | 'state' | 'errorWhat' | 'onRetry'>) {
  const header = (variant: 'phone' | 'desktop') => (
    <PageHeader
      variant={variant}
      back={{ label: backLabel, to: backTo, onClick: backOnClick }}
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      chip={chip}
      actions={actions}
      readOnly={readOnly}
      state={state}
      errorWhat={errorWhat}
      onRetry={onRetry}
    />
  )
  return (
    <AppShell activeChildId={childId}>
      {isDesktop ? (
        <main className="min-w-0 bg-canvas px-6 pt-7 pb-12 lg:px-12">
          <div className={`mx-auto flex flex-col gap-6 ${maxWidth ?? 'max-w-[904px]'}`}>
            {header('desktop')}
            {children}
          </div>
        </main>
      ) : (
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
          {header('phone')}
          <div className="flex flex-col gap-5 px-5 pt-1">{children}</div>
        </main>
      )}
    </AppShell>
  )
}

/**
 * `/children/:childId/suplementos/nueva`, `/children/:childId/actividades/nueva`, `/mis-suplementos/nueva`, `/mis-actividades/nueva` and
 * `/suplementos/:routineId/editar`, `/actividades/:routineId/editar`: the form as a PAGE (it is long and changes with the kind).
 * Leaving with something typed asks first. If the server answers that the plan isn't paid, the plan notice opens and what was typed
 * stays. The kind of an existing one is its own; the address that doesn't match goes to the right one.
 */
export function RoutineFormPage({ kind: creatingKind = 'supplement', personal: creatingPersonal = false }: { kind?: RoutineKind; personal?: boolean } = {}) {
  const params = useParams<{ childId: string; routineId: string }>()
  const routineId = params.routineId
  const navigate = useNavigate()
  const location = useLocation()
  const { isDesktop } = useSidebarSession()
  const day = useLocalDay()
  const accountQuery = useCurrentAccount()

  const routineQuery = useRoutine(routineId, day)
  const routine = routineQuery.data
  const kind = routine?.kind ?? creatingKind
  const activity = kind === 'activity'
  const childId = params.childId ?? routine?.childId ?? undefined
  // A person's own (specs/033, part 3): the new route of their section, or an existing one with no child.
  const personal = creatingPersonal || (routine !== undefined && routine.childId === null)
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const access = useChildAccess(accountQuery.data, childId)

  const createMutation = useCreateRoutine(childId ?? '')
  const createPersonalMutation = useCreatePersonalRoutine(accountQuery.data?.id ?? '')
  const updateMutation = useUpdateRoutine(routineId ?? '')

  const dirtyRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  useUnsavedWork(dirty)
  const handleDirty = useCallback((value: boolean) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])
  const [planOpen, setPlanOpen] = useState(false)
  const closePlan = useCallback(() => setPlanOpen(false), [])

  const editing = routineId !== undefined
  const base = activity ? '/actividades' : '/suplementos'
  const personalHome = activity ? '/mis-actividades' : '/mis-suplementos'
  const noun = activity ? 'actividad' : 'suplemento'
  const backTo = editing ? `${base}/${routineId}` : personal ? personalHome : `/children/${childId}`
  const personalTitle = activity ? 'Mis actividades' : 'Mis suplementos'
  const discardQuestion = `¿Descartar ${activity ? 'la' : 'el'} ${noun}? Se perderá lo que capturaste.`
  // specs/056 (design H4): «← Cancelar» (asking first when something was typed), the title and «Para Mateo».
  const subtitle = personal ? personalTitle : child ? `Para ${child.firstName}` : undefined
  const frame = (content: ReactNode) => (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={personal ? undefined : childId}
      backLabel="← Cancelar"
      backTo={backTo}
      backOnClick={(event) => {
        if (dirtyRef.current && !window.confirm(discardQuestion)) event.preventDefault()
      }}
      title={`${editing ? 'Editar' : 'Agregar'} ${noun}`}
      subtitle={subtitle}
      maxWidth="max-w-[640px]"
    >
      {content}
    </RoutinePageFrame>
  )

  const message = (text: string) => (
    <p className="rounded-[22px] bg-surface p-6 text-base leading-relaxed text-body shadow-[0_8px_20px_rgba(4,37,43,0.07)]">{text}</p>
  )

  if (editing && routineQuery.isPending) return frame(<p className="text-base font-semibold text-action">Cargando…</p>)
  if (editing && (routineQuery.isError || !routine)) return frame(message(`No se encontró ${activity ? 'esta actividad' : 'este suplemento'}.`))
  if (editing && routine && !location.pathname.startsWith(base)) return <Navigate to={`${base}/${routine.id}/editar`} replace />
  if (!personal && accountQuery.data && !access.canAdd) {
    return frame(message(`Solo un Tutor puede agregar o editar ${activity ? 'actividades' : 'suplementos'}.`))
  }
  if (routine && routine.status === 'ended') {
    return frame(
      message(
        `${activity ? 'Esta actividad' : 'Este suplemento'} ya terminó y no se puede editar. Para volver a registrar${activity ? 'la' : 'lo'}, agrega ${activity ? 'una actividad nueva' : 'un suplemento nuevo'}.`,
      ),
    )
  }

  const leave = () => {
    if (dirtyRef.current && !window.confirm(discardQuestion)) return
    navigate(backTo)
  }

  async function save(input: RoutineInput) {
    const saved = editing
      ? await updateMutation.mutateAsync(input)
      : personal
        ? await createPersonalMutation.mutateAsync(input)
        : await createMutation.mutateAsync(input)
    dirtyRef.current = false
    // replace: "back" from the detail lands on the child, not on an already-sent form.
    navigate(`${base}/${saved.id}`, { replace: true })
  }

  return (
    <>
      {frame(
        <RoutineForm
          // A fresh form per routine: the initial values are the routine's.
          key={routine?.id ?? 'new'}
          kind={kind}
          routine={routine}
          onSubmit={save}
          onCancel={leave}
          onPlanRequired={() => setPlanOpen(true)}
          onDirtyChange={handleDirty}
          personal={personal}
        />,
      )}
      {planOpen && <FreemiumLimitModal reason="supplements" onStayFree={closePlan} onViewPlans={() => navigate('/planes')} />}
    </>
  )
}
