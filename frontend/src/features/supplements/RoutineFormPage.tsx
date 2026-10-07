import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { useLocalDay } from '../../shared/useLocalDay'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { useCreatePersonalRoutine, useCreateRoutine, useRoutine, useUpdateRoutine } from './hooks'
import { RoutineForm } from './RoutineForm'
import type { RoutineInput } from './types'

/** The page frame of the routine form and detail, in the two designs: the phone's dark header and the web's text header. */
export function RoutinePageFrame({
  isDesktop,
  childId,
  backLabel,
  backTo,
  eyebrow,
  title,
  children,
  maxWidth,
}: {
  isDesktop: boolean
  childId: string | undefined
  backLabel: string
  backTo: string
  eyebrow: string
  title: ReactNode
  children: ReactNode
  /** The web's content column (the form is 640 px). */
  maxWidth?: string
}) {
  return (
    <AppShell activeChildId={childId}>
      {isDesktop ? (
        <main className="min-w-0 bg-canvas px-6 py-8 lg:px-12 lg:py-11">
          <div className={`mx-auto flex flex-col gap-7 ${maxWidth ?? 'max-w-[904px]'}`}>
            <div className="flex flex-col">
              <Link to={backTo} className="inline-flex min-h-11 items-center self-start text-sm font-bold text-action hover:underline">
                {backLabel}
              </Link>
              <p className="text-sm font-bold text-action">{eyebrow}</p>
              <h1 className="mt-1 text-[38px] leading-[1.1] font-black tracking-[-0.03em] text-ink [overflow-wrap:anywhere]">{title}</h1>
            </div>
            {children}
          </div>
        </main>
      ) : (
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
          <header className="bg-ink px-6 pt-4 pb-[26px]">
            <Link to={backTo} className="inline-flex min-h-11 items-center text-sm font-bold text-bright-soft hover:text-white">
              {backLabel}
            </Link>
            <p className="mt-1.5 text-sm font-semibold text-hint-border">{eyebrow}</p>
            <h1 className="mt-1 text-3xl leading-[1.15] font-black tracking-[-0.03em] text-white [overflow-wrap:anywhere]">{title}</h1>
          </header>
          <div className="flex flex-col gap-5 px-5 pt-6">{children}</div>
        </main>
      )}
    </AppShell>
  )
}

/**
 * `/children/:childId/suplementos/nueva` and `/suplementos/:routineId/editar`: the routine form as a PAGE (it is long and
 * changes with the periodicity). Leaving with something typed asks first. If the server answers that the plan isn't paid,
 * the plan notice opens and what was typed stays.
 */
export function RoutineFormPage({ personal: creatingPersonal = false }: { personal?: boolean } = {}) {
  const params = useParams<{ childId: string; routineId: string }>()
  const routineId = params.routineId
  const navigate = useNavigate()
  const { isDesktop } = useSidebarSession()
  const day = useLocalDay()
  const accountQuery = useCurrentAccount()

  const routineQuery = useRoutine(routineId, day)
  const routine = routineQuery.data
  const childId = params.childId ?? routine?.childId ?? undefined
  // A person's own routine (specs/033, part 3): the new-routine route of the section, or an existing routine with no child.
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
  const backTo = editing ? `/suplementos/${routineId}` : personal ? '/mis-suplementos' : `/children/${childId}`
  const childName = personal ? 'Mis suplementos' : (child?.firstName ?? 'Volver')
  const eyebrow = personal ? 'Mis suplementos' : child ? `Suplemento · ${child.firstName} ${child.lastName}` : 'Suplemento'
  const frame = (content: ReactNode) => (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={personal ? undefined : childId}
      backLabel={editing && routine ? `← ${routine.name}` : `← ${childName}`}
      backTo={backTo}
      eyebrow={eyebrow}
      title={editing ? 'Editar rutina' : 'Nueva rutina'}
      maxWidth="max-w-[640px]"
    >
      {content}
    </RoutinePageFrame>
  )

  const message = (text: string) => (
    <p className="rounded-[22px] bg-surface p-6 text-base leading-relaxed text-body shadow-[0_8px_20px_rgba(4,37,43,0.07)]">{text}</p>
  )

  if (editing && routineQuery.isPending) return frame(<p className="text-base font-semibold text-action">Cargando…</p>)
  if (editing && (routineQuery.isError || !routine)) return frame(message('No se encontró esta rutina.'))
  if (!personal && accountQuery.data && !access.canAdd) return frame(message('Solo un Tutor puede crear o editar rutinas.'))
  if (routine && routine.status === 'ended') {
    return frame(message('Esta rutina ya terminó y no se puede editar. Para volver a registrarla, crea una rutina nueva.'))
  }

  const leave = () => {
    if (dirtyRef.current && !window.confirm('¿Descartar la rutina? Se perderá lo que capturaste.')) return
    navigate(backTo)
  }

  async function save(input: RoutineInput) {
    const saved = editing
      ? await updateMutation.mutateAsync(input)
      : personal
        ? await createPersonalMutation.mutateAsync(input)
        : await createMutation.mutateAsync(input)
    dirtyRef.current = false
    // replace: "back" from the routine lands on the child, not on an already-sent form.
    navigate(`/suplementos/${saved.id}`, { replace: true })
  }

  return (
    <>
      {frame(
        <RoutineForm
          // A fresh form per routine: the initial values are the routine's.
          key={routine?.id ?? 'new'}
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
