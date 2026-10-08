import { useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLocalDay } from '../../shared/useLocalDay'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { dayKey } from '../consultations/treatmentDays'
import { useChildAccess } from '../family/useChildAccess'
import { useSidebarSession } from '../home/useSidebarSession'
import { SupplementApiError } from './api'
import { DayProgress } from './DayProgress'
import { FinishRoutineDialog } from './FinishRoutineDialog'
import { useFinishRoutine, usePauseRoutine, useResumeRoutine, useRoutine, useRoutineDoseToggle } from './hooks'
import { MyRemindersToggle } from './MyRemindersToggle'
import { RealizadoButton } from './RealizadoButton'
import { RoutineDoseChip } from './RoutineDoseChip'
import { RoutinePageFrame } from './RoutineFormPage'
import { RoutineStatusChip } from './RoutineStatusChip'
import { dayCount, detailRows, endedNote, lastMarked, lastMarkedDose, nextUnmarked, noTodayText, pausedNote, todayLabel } from './scheduleText'
import type { Routine } from './types'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outlineButton =
  'inline-flex min-h-12 flex-[1_1_110px] cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-[18px] text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const linkButton =
  'min-h-11 cursor-pointer rounded-2xl px-3.5 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

/** «Quitar la última marca» (mock D3): takes back the last dose marked today, for a tap by mistake. The server decides who may. */
function UndoLastMark({ routine, canManage }: { routine: Routine; canManage: boolean }) {
  const last = lastMarkedDose(routine.doses)
  const mutation = useRoutineDoseToggle(routine.id, last?.id ?? '')
  if (!last || !(canManage || last.takenBy?.mine)) return null
  return (
    <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(false)} className={`self-center ${linkButton}`}>
      Quitar la última marca
    </button>
  )
}

/** The detail's day card of a supplement (mock SuplementoDetalle): «Hoy · jue 8 oct», «2 de 6 tomas hoy», the bar and the doses to mark. */
function SupplementToday({ routine, canManage, own, today }: { routine: Routine; canManage: boolean; own: boolean; today: string }) {
  const count = dayCount(routine.doses)
  const paused = routine.status === 'paused'
  if (routine.status === 'ended') return null
  if (routine.doses.length > 0) {
    return (
      <>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[34px] font-black tracking-[-0.03em] text-ink tabular-nums">
            {count.done} de {count.total}
          </span>
          <span className="text-[17px] font-bold text-body">tomas hoy</span>
        </p>
        <DayProgress done={count.done} total={count.total} label={`${count.done} de ${count.total} tomas hoy`} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 pt-1">
          {routine.doses.map((dose) => (
            <RoutineDoseChip key={dose.id} routineId={routine.id} dose={dose} canManage={canManage} own={own} />
          ))}
        </div>
      </>
    )
  }
  if (paused) return <p className="text-[15px] leading-normal text-body">En pausa: hoy no hay tomas.</p>
  return (
    <p className="text-[15px] leading-normal text-body">
      {routine.nextDose ? noTodayText(routine.nextDose.scheduledAt, today, own) : 'Hoy no hay tomas.'}
    </p>
  )
}

/** The detail's day card of an activity (mock ActividadDetalle): the count, the bar, «Próxima» and «Última marcada», «✓ Realizado». */
function ActivityToday({ routine, canManage, own, today }: { routine: Routine; canManage: boolean; own: boolean; today: string }) {
  const count = dayCount(routine.doses)
  if (routine.status === 'paused' || routine.status === 'ended') {
    return routine.status === 'ended' && count.total > 0 ? (
      <>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[34px] font-black tracking-[-0.03em] text-ink tabular-nums">
            {count.done} de {count.total}
          </span>
          <span className="text-[17px] font-bold text-body">hechas hoy</span>
        </p>
        <DayProgress done={count.done} total={count.total} label={`${count.done} de ${count.total} hechas hoy`} />
      </>
    ) : null
  }
  if (count.total === 0) {
    return (
      <p className="text-[15px] leading-normal text-body">{routine.nextDose ? noTodayText(routine.nextDose.scheduledAt, today, own) : 'Hoy no hay avisos.'}</p>
    )
  }
  const next = nextUnmarked(routine.doses)
  const last = lastMarked(routine.doses)
  const allDone = count.done >= count.total
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[34px] font-black tracking-[-0.03em] text-ink tabular-nums">
          {count.done} de {count.total}
        </span>
        <span className="text-[17px] font-bold text-body">hechas hoy</span>
      </p>
      <DayProgress done={count.done} total={count.total} label={`${count.done} de ${count.total} hechas hoy`} />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-0.5 rounded-[14px] bg-hint px-3.5 py-3">
          <span className="text-[13px] font-bold text-body">Próxima</span>
          <span className="text-xl font-black text-ink tabular-nums">{next ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[14px] bg-hint px-3.5 py-3">
          <span className="text-[13px] font-bold text-body">Última marcada</span>
          <span className="text-xl font-black text-ink tabular-nums">{last?.at ?? '—'}</span>
          {last && !own && <span className="text-[13px] font-bold text-body">por {last.by}</span>}
        </div>
      </div>
      {allDone ? (
        <p className="text-[15px] leading-normal text-body">No quedan avisos hoy.</p>
      ) : (
        <RealizadoButton routineId={routine.id} name={routine.name} variant="solid" />
      )}
      <UndoLastMark routine={routine} canManage={canManage} />
    </>
  )
}

/**
 * `/suplementos/:routineId` and `/actividades/:routineId` — the detail of a supplement or an activity (mocks SuplementoDetalle /
 * ActividadDetalle), two designs: the phone stacks everything in one column, the web puts the day card and «Tus avisos» at the left
 * and the data and the actions at the right. There is no calendar: the day is the one card (specs/035 B8). Pausing needs no
 * confirmation (resuming undoes it); finishing asks first. Who can do what: a Tutor pauses, edits (paid plan) and finishes; a
 * Caregiver sees, marks («Realizado» too) and chooses their own reminders. The address that doesn't match the kind goes to the right one.
 */
export function RoutineDetailPage() {
  const { routineId } = useParams<{ routineId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDesktop } = useSidebarSession()
  const day = useLocalDay()
  const today = dayKey(day.from)
  const accountQuery = useCurrentAccount()

  const [finishOpen, setFinishOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const finishButtonRef = useRef<HTMLButtonElement>(null)

  const query = useRoutine(routineId, day)
  const pause = usePauseRoutine(routineId ?? '')
  const resume = useResumeRoutine(routineId ?? '')
  const finish = useFinishRoutine(routineId ?? '')

  const routine = query.data
  const childId = routine?.childId ?? undefined
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const access = useChildAccess(accountQuery.data, childId)

  // A person's own (specs/033, part 3) has no child: it belongs to «Mis suplementos» / «Mis actividades» and only they reach it.
  const personal = routine !== undefined && routine.childId === null
  // Until the routine is read, the address says which kind it is.
  const kind = routine?.kind ?? (location.pathname.startsWith('/actividades') ? 'activity' : 'supplement')
  const activity = kind === 'activity'
  const noun = activity ? 'Actividad' : 'Suplemento'
  const base = activity ? '/actividades' : '/suplementos'
  const personalHome = activity ? '/mis-actividades' : '/mis-suplementos'
  const backTo = personal ? personalHome : childId ? `/children/${childId}` : '/home'
  const frameFor = (title: string, content: ReactNode) => (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={childId}
      backLabel={personal ? (activity ? '← Mis actividades' : '← Mis suplementos') : child ? `← ${child.firstName}` : '← Tus hijos'}
      backTo={backTo}
      eyebrow={personal ? (activity ? 'Mis actividades' : 'Mis suplementos') : child ? `${noun} · ${child.firstName} ${child.lastName}` : noun}
      title={title}
    >
      {content}
    </RoutinePageFrame>
  )

  if (query.isPending) return frameFor(noun, <p className="text-base font-semibold text-action">Cargando…</p>)
  if (query.isError || !routine) {
    const missing = query.error instanceof SupplementApiError && (query.error.kind === 'routine_not_found' || query.error.kind === 'forbidden')
    return frameFor(
      noun,
      <p className={`${card} p-6 text-base leading-relaxed text-body`}>
        {missing ? `No se encontró ${activity ? 'esta actividad' : 'este suplemento'}.` : `No se pudo cargar ${activity ? 'la actividad' : 'el suplemento'}.`}{' '}
        <Link to={backTo} className="font-bold text-action hover:underline">
          Volver
        </Link>
      </p>,
    )
  }
  // The old address of an activity (a reminder from before, a bookmark) lands on the right one.
  if (!location.pathname.startsWith(base)) return <Navigate to={`${base}/${routine.id}`} replace />

  const rows = detailRows(routine, personal)
  // Their own: they are its owner (Full) once the account is known; with the plan not paid only «Finalizar» is left (mock G3).
  const canManage = accountQuery.data !== undefined && (personal || access.canAdd)
  const planLapsed = personal && !routine.canEdit
  const paused = routine.status === 'paused'
  const ended = routine.status === 'ended'

  const failure = (error: unknown): string => {
    if (error instanceof SupplementApiError && error.kind === 'routine_limit') {
      const what = activity ? 'actividades activas' : 'suplementos activos'
      return personal
        ? `Ya tienes el máximo de ${what}. Pausa o finaliza ${activity ? 'una' : 'uno'} para poder reanudar ${activity ? 'esta' : 'este'}.`
        : `Este hijo ya tiene el máximo de ${what}. Pausa o finaliza ${activity ? 'una' : 'uno'} para poder reanudar ${activity ? 'esta' : 'este'}.`
    }
    return 'No se pudo completar. Inténtalo de nuevo.'
  }
  const doPause = () => {
    setActionError(null)
    pause.mutate(undefined, { onError: (e) => setActionError(failure(e)) })
  }
  const doResume = () => {
    setActionError(null)
    resume.mutate(undefined, {
      onError: (e) => {
        if (e instanceof SupplementApiError && e.kind === 'plan_required') setPlanOpen(true)
        else setActionError(failure(e))
      },
    })
  }
  const doFinish = () => {
    setActionError(null)
    finish.mutate(undefined, {
      onSuccess: () => setFinishOpen(false),
      onError: (e) => setActionError(failure(e)),
    })
  }

  const finishLabel = activity ? 'Finalizar actividad' : 'Finalizar suplemento'
  const dayCard = (
    <div className={`${card} flex flex-col gap-3.5 p-[22px]`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">{todayLabel(day.from)}</p>
        <RoutineStatusChip kind={kind} status={routine.status} />
      </div>
      {activity ? (
        <ActivityToday routine={routine} canManage={canManage} own={personal} today={today} />
      ) : (
        <SupplementToday routine={routine} canManage={canManage} own={personal} today={today} />
      )}
      {paused && routine.pausedAt && (
        <p role="status" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-[15px] leading-normal text-body">
          {pausedNote(routine, routine.pausedAt)}
        </p>
      )}
      {ended && routine.endedAt && (
        <p className="rounded-[14px] bg-slate-100 px-4 py-3.5 text-[15px] leading-normal text-calendar-text">
          {endedNote(routine, routine.endedAt, routine.progress.taken, routine.progress.total)}
        </p>
      )}
    </div>
  )

  const dataCard = (
    <div className={`${card} flex flex-col gap-4 p-[22px]`}>
      <dl className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.k} className="flex flex-col gap-0.5">
            <dt className="text-[13px] font-bold text-ink">{r.k}</dt>
            <dd className="text-[15px] leading-normal text-body [overflow-wrap:anywhere]">{r.v}</dd>
          </div>
        ))}
      </dl>
      {planLapsed && !ended && (
        <div className="flex flex-col gap-1.5 pt-1">
          <p role="note" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-sm leading-normal text-body">
            {activity
              ? 'Con el plan gratuito puedes ver la actividad y marcar «Realizado». Para editar, pausar o reanudar se necesita el plan completo.'
              : 'Con el plan gratuito puedes ver y marcar las tomas. Para editar, pausar o reanudar se necesita el plan completo.'}
          </p>
          <Link to="/planes" className="inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:underline">
            Ver el plan completo →
          </Link>
        </div>
      )}
      {!ended && canManage && (
        <div className="flex flex-wrap gap-2.5 pt-1">
          {planLapsed ? null : paused ? (
            <button
              type="button"
              disabled={resume.isPending}
              onClick={doResume}
              className="min-h-12 flex-[1_1_140px] cursor-pointer rounded-2xl bg-confirmed px-[22px] text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resume.isPending ? 'Reanudando…' : 'Reanudar'}
            </button>
          ) : (
            <button type="button" disabled={pause.isPending} onClick={doPause} className={outlineButton}>
              {pause.isPending ? 'Pausando…' : 'Pausar'}
            </button>
          )}
          {routine.canEdit && (
            <Link to={`${base}/${routine.id}/editar`} className={outlineButton}>
              Editar
            </Link>
          )}
          <button ref={finishButtonRef} type="button" onClick={() => setFinishOpen(true)} className={`flex-[1_1_100%] ${linkButton}`}>
            {finishLabel}
          </button>
        </div>
      )}
      {!ended && !canManage && !personal && (
        <p className="text-sm leading-normal text-slate-600">Un Tutor puede pausar, editar o finalizar {activity ? 'esta actividad' : 'este suplemento'}.</p>
      )}
      {actionError && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {actionError}
        </p>
      )}
    </div>
  )

  const left = (
    <div className="flex min-w-0 flex-col gap-5">
      {dayCard}
      {routine.status === 'active' && <MyRemindersToggle kind={kind} routineId={routine.id} enabled={routine.myReminders} personal={personal} />}
    </div>
  )

  return (
    <>
      {frameFor(
        routine.name,
        isDesktop ? (
          <div className="flex flex-wrap items-start gap-x-7 gap-y-5">
            <div className="min-w-0 flex-[1.25_1_340px]">{left}</div>
            <div className="min-w-0 flex-[1_1_320px]">{dataCard}</div>
          </div>
        ) : (
          <>
            {left}
            {dataCard}
          </>
        ),
      )}
      {finishOpen && (
        <FinishRoutineDialog
          kind={kind}
          name={routine.name}
          busy={finish.isPending}
          error={finish.isError ? actionError : null}
          onConfirm={doFinish}
          onCancel={() => setFinishOpen(false)}
          opener={finishButtonRef}
          personal={personal}
        />
      )}
      {planOpen && <FreemiumLimitModal reason="supplements" onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
    </>
  )
}
