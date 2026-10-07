import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LONG_MONTHS } from '../../shared/date'
import { useLocalDay } from '../../shared/useLocalDay'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { dayKey, type Month } from '../consultations/treatmentDays'
import { useChildAccess } from '../family/useChildAccess'
import { useSidebarSession } from '../home/useSidebarSession'
import { SupplementApiError } from './api'
import { FinishRoutineDialog } from './FinishRoutineDialog'
import { useFinishRoutine, usePauseRoutine, useResumeRoutine, useRoutine } from './hooks'
import { MyRemindersToggle } from './MyRemindersToggle'
import { RoutineStatusChip } from './RoutineCard'
import { RoutineCalendar } from './RoutineCalendar'
import { RoutineDoseChip } from './RoutineDoseChip'
import { RoutinePageFrame } from './RoutineFormPage'
import { detailRows, endedNote, pausedNote, progressSummary } from './scheduleText'
import type { Routine } from './types'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outlineButton =
  'inline-flex min-h-12 flex-[1_1_110px] cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-[18px] text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

const monthOf = (key: string): Month => {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m - 1 }
}
const monthIndex = (m: Month) => m.year * 12 + m.month
const monthRange = (m: Month) => ({ from: new Date(m.year, m.month, 1), to: new Date(m.year, m.month + 1, 1) })

/** The last day the routine has doses to show: its end date, the day it ended or paused, or — a running one with no end — today. */
function lastDayOf(routine: Routine, today: string): string {
  if (routine.status === 'ended' && routine.endedAt) return dayKey(routine.endedAt)
  if (routine.endDate && routine.endDate < today) return routine.endDate
  if (routine.status === 'paused' && routine.pausedAt) return dayKey(routine.pausedAt)
  return routine.endDate ?? today
}

/**
 * `/suplementos/:routineId` — a routine's detail (mock RutinaDetalle), two designs: the phone stacks everything in one column,
 * the web puts the data and the actions at the left and the progress and the calendar at the right. Pausing needs no
 * confirmation (resuming undoes it); finishing asks first. Who can do what: a Tutor pauses, edits (paid plan) and finishes; a
 * Caregiver sees, marks and chooses their own reminders.
 */
export function RoutineDetailPage() {
  const { routineId } = useParams<{ routineId: string }>()
  const navigate = useNavigate()
  const { isDesktop } = useSidebarSession()
  const day = useLocalDay()
  const today = dayKey(day.from)
  const accountQuery = useCurrentAccount()

  const [picked, setPicked] = useState<{ routineId: string; month: Month | null; day: string | null } | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const finishButtonRef = useRef<HTMLButtonElement>(null)

  const current = picked && picked.routineId === routineId ? picked : null
  const todayMonth = monthOf(today)
  const month = current?.month ?? todayMonth
  const query = useRoutine(routineId, monthRange(month))
  const pause = usePauseRoutine(routineId ?? '')
  const resume = useResumeRoutine(routineId ?? '')
  const finish = useFinishRoutine(routineId ?? '')

  const routine = query.data
  const childId = routine?.childId ?? undefined
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const access = useChildAccess(accountQuery.data, childId)

  const backTo = childId ? `/children/${childId}` : '/home'
  const frameFor = (title: string, content: ReactNode) => (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={childId}
      backLabel={child ? `← ${child.firstName}` : '← Tus hijos'}
      backTo={backTo}
      eyebrow={child ? `Suplemento · ${child.firstName} ${child.lastName}` : 'Suplemento'}
      title={title}
    >
      {content}
    </RoutinePageFrame>
  )

  if (query.isPending) return frameFor('Rutina', <p className="text-base font-semibold text-action">Cargando…</p>)
  if (query.isError || !routine) {
    const missing = query.error instanceof SupplementApiError && (query.error.kind === 'routine_not_found' || query.error.kind === 'forbidden')
    return frameFor(
      'Rutina',
      <p className={`${card} p-6 text-base leading-relaxed text-body`}>
        {missing ? 'No se encontró esta rutina.' : 'No se pudo cargar la rutina.'}{' '}
        <Link to={backTo} className="font-bold text-action hover:underline">
          Volver
        </Link>
      </p>,
    )
  }

  const firstMonth = monthOf(routine.firstDate)
  const lastDay = lastDayOf(routine, today)
  const lastMonth = routine.status === 'active' && !routine.endDate ? { year: todayMonth.year, month: todayMonth.month + 1 } : monthOf(lastDay)
  const selected = current?.day ?? (today < routine.firstDate ? routine.firstDate : today > lastDay ? lastDay : today)
  const selectedDoses = routine.doses.filter((d) => dayKey(d.scheduledAt) === selected)
  const [, sm, sd] = selected.split('-').map(Number)
  const dayTitle = `Tomas del ${sd} de ${LONG_MONTHS[sm - 1]}`
  const progress = progressSummary(routine, today)
  const rows = detailRows(routine)
  const canManage = access.canAdd
  const paused = routine.status === 'paused'
  const ended = routine.status === 'ended'

  const select = (key: string) => setPicked({ routineId: routineId!, month: current?.month ?? null, day: key })
  const moveMonth = (delta: -1 | 1) => {
    const next = new Date(month.year, month.month + delta, 1)
    setPicked({ routineId: routineId!, month: { year: next.getFullYear(), month: next.getMonth() }, day: current?.day ?? null })
  }
  const dayEmpty = paused ? 'En pausa: este día no tiene tomas.' : 'Este día no tiene tomas.'

  const failure = (error: unknown): string => {
    if (error instanceof SupplementApiError && error.kind === 'routine_limit') {
      return 'Este hijo ya tiene el máximo de rutinas activas. Pausa o finaliza una para poder reanudar esta.'
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

  const dataCard = (
    <div className={`${card} flex flex-col gap-4 p-[22px]`}>
      <div className="flex">
        <RoutineStatusChip status={routine.status} />
      </div>
      {paused && routine.pausedAt && (
        <p role="status" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-[15px] leading-normal text-body">
          {pausedNote(routine.pausedAt)}
        </p>
      )}
      {ended && routine.endedAt && (
        <p className="rounded-[14px] bg-slate-100 px-4 py-3.5 text-[15px] leading-normal text-calendar-text">
          {endedNote(routine.endedAt, routine.progress.taken, routine.progress.total)}
        </p>
      )}
      <dl className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.k} className="flex flex-col gap-0.5">
            <dt className="text-[13px] font-bold text-ink">{r.k}</dt>
            <dd className="text-[15px] leading-normal text-body [overflow-wrap:anywhere]">{r.v}</dd>
          </div>
        ))}
      </dl>
      {!ended && canManage && (
        <div className="flex flex-wrap gap-2.5 pt-1">
          {paused ? (
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
            <Link to={`/suplementos/${routine.id}/editar`} className={outlineButton}>
              Editar
            </Link>
          )}
          <button
            ref={finishButtonRef}
            type="button"
            onClick={() => setFinishOpen(true)}
            className="min-h-11 flex-[1_1_100%] cursor-pointer rounded-2xl px-3.5 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Finalizar rutina
          </button>
        </div>
      )}
      {!ended && !canManage && <p className="text-sm leading-normal text-slate-600">Un Tutor puede pausar, editar o finalizar esta rutina.</p>}
      {actionError && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {actionError}
        </p>
      )}
    </div>
  )

  const left = (
    <div className="flex min-w-0 flex-col gap-5">
      {dataCard}
      {routine.status === 'active' && <MyRemindersToggle routineId={routine.id} enabled={routine.myReminders} />}
    </div>
  )

  const right = (
    <div className="flex min-w-0 flex-col gap-5">
      <div className={`${card} flex flex-col gap-1.5 px-[22px] py-5`}>
        <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Progreso</p>
        <p className="text-[34px] font-black tracking-[-0.03em] text-ink">{progress.big}</p>
        <p className="text-[15px] font-semibold text-body">{progress.sub}</p>
        {progress.pct !== null && (
          <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-hint-edge">
            <div className="h-full rounded-full bg-bright" style={{ width: `${progress.pct}%` }} />
          </div>
        )}
      </div>

      <div className={`${card} flex flex-col gap-3.5 px-3 py-4`}>
        <RoutineCalendar
          month={month}
          doses={routine.doses}
          selected={selected}
          onSelect={select}
          onMonth={moveMonth}
          canPrev={monthIndex(month) > monthIndex(firstMonth)}
          canNext={monthIndex(month) < monthIndex(lastMonth)}
        />
        <div className="h-px bg-hint-edge" />
        <div className="flex flex-col gap-2.5 px-1.5 pb-1.5">
          <h3 className="text-[17px] font-black text-ink">{dayTitle}</h3>
          {selectedDoses.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
              {selectedDoses.map((dose) => (
                <RoutineDoseChip key={dose.id} routineId={routine.id} dose={dose} canManage={canManage} />
              ))}
            </div>
          ) : (
            <p className="text-[15px] leading-normal text-body">{dayEmpty}</p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {frameFor(
        routine.name,
        isDesktop ? (
          <div className="flex flex-wrap items-start gap-x-7 gap-y-5">
            <div className="min-w-0 flex-[1_1_320px]">{left}</div>
            <div className="min-w-0 flex-[1.6_1_440px]">{right}</div>
          </div>
        ) : (
          <>
            {left}
            {right}
          </>
        ),
      )}
      {finishOpen && (
        <FinishRoutineDialog
          name={routine.name}
          taken={routine.progress.taken}
          busy={finish.isPending}
          error={finish.isError ? actionError : null}
          onConfirm={doFinish}
          onCancel={() => setFinishOpen(false)}
          opener={finishButtonRef}
        />
      )}
      {planOpen && <FreemiumLimitModal reason="supplements" onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
    </>
  )
}
