import { useEffect, useState, type ReactNode } from 'react'
import { formatTime } from '../../shared/date'
import { DayIcon } from '../../shared/ui/DayRow'
import { useLocalDay } from '../../shared/useLocalDay'
import { groupByPeriod } from '../consultations/dayPeriods'
import { canUnmarkDose, takenByText } from '../consultations/doseStatus'
import type { OverviewDose } from '../consultations/types'
import { useOverviewDoseToggle } from '../consultations/useDoseToggle'
import { MARKED_SHOWN_MS } from '../home/ChildDayCard'
import { useChildDay } from '../home/useChildDay'
import { useMarkDone } from '../supplements/hooks'
import type { Routine } from '../supplements/types'
import {
  CHILD,
  activitiesDone,
  doneLine,
  dosesToday,
  loadFailedDay,
  markLabel,
  nextActivity,
  toMarkChip,
  unregisteredChip,
} from './childDetailText'

type Variant = 'phone' | 'desktop'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outline =
  'min-h-11 shrink-0 cursor-pointer rounded-[14px] border-2 border-action bg-transparent text-[15px] font-extrabold text-action hover:bg-hint disabled:cursor-default'
const mint = 'inline-flex min-h-11 shrink-0 items-center rounded-[14px] bg-confirmed-soft font-extrabold text-confirmed-strong'
const chip = 'rounded-full text-[14px] font-extrabold'

/**
 * One dose of the day with its toggle (specs/056, design A): «Marcar», the session's own «✓ 06:10» (tap = take it back) or
 * somebody else's «✓ por Rosa, 08:05», which is the same button disabled — fixed accessible name, state in `aria-pressed`
 * (the project's toggle convention, specs/055 deviation 7). The API has no amount per dose: the line is the time.
 */
function DoseRow({ dose, variant, canManage }: { dose: OverviewDose; variant: Variant; canManage: boolean }) {
  const toggle = useOverviewDoseToggle(dose)
  const time = formatTime(dose.scheduledAt)
  const others = dose.taken && dose.takenBy?.mine !== true
  // A mark somebody else made is only taken back by who can do everything (specs/032, `canUnmarkDose`).
  const locked = !canUnmarkDose(dose, canManage)
  const desktop = variant === 'desktop'
  return (
    <li
      className={`flex items-center border-b border-hint-edge ${desktop ? 'min-h-16 flex-wrap gap-x-2.5 gap-y-2 py-2' : 'min-h-[60px] gap-3 py-1.5'}`}
    >
      <DayIcon kind={dose.kind === 'supplement' ? 'sup' : 'med'} />
      <span className={`flex min-w-0 flex-col ${desktop ? 'flex-[1_1_100px] gap-0.5' : 'flex-1 gap-[3px]'}`}>
        <span className={`font-extrabold text-ink [overflow-wrap:anywhere] ${desktop ? 'text-[15px]' : 'text-[16px]'}`}>{dose.medicationName}</span>
        <span className={`flex flex-wrap items-center gap-1.5 text-body ${desktop ? 'text-[13px]' : 'text-[14px]'}`}>
          {dose.kind === 'supplement' ? `${CHILD.supplement} · ${time}` : time}
          {dose.status === 'unregistered' && !dose.taken && (
            <span className="rounded-full border-[1.5px] border-dashed border-calendar-muted px-2 py-px text-[12px] font-extrabold text-body">
              {CHILD.unregistered}
            </span>
          )}
        </span>
      </span>
      <button
        type="button"
        aria-label={markLabel(dose.medicationName, time)}
        aria-pressed={dose.taken}
        disabled={toggle.isPending || locked}
        onClick={() => toggle.mutate(!dose.taken)}
        className={
          dose.taken
            ? `${mint} ${others ? 'px-3 text-[14px]' : 'px-3.5 text-[15px]'} ${locked ? '' : 'cursor-pointer'}`
            : `${outline} ${desktop ? 'min-w-[88px] px-4' : 'min-w-24 px-[18px]'}`
        }
      >
        {!dose.taken ? CHILD.mark : others ? `✓ ${takenByText(dose.takenBy)}` : `✓ ${formatTime(dose.takenBy?.at ?? dose.scheduledAt)}`}
      </button>
      {toggle.isError && (
        <p role="alert" className="w-full pb-1 text-[14px] text-body">
          {CHILD.markFailed}
        </p>
      )}
    </li>
  )
}

interface Target {
  routineId: string
  name: string
  at: string
}

function earliest(activities: Routine[], keep: (d: Routine['doses'][number]) => boolean): Target | null {
  const all = activities.flatMap((r) => r.doses.filter(keep).map((d) => ({ routineId: r.id, name: r.name, at: d.scheduledAt })))
  return all.sort((a, b) => a.at.localeCompare(b.at))[0] ?? null
}

/** «✓ Realizado» of the activity whose unmarked dose comes first (the server marks the earliest unmarked of the day, specs/035). */
function DoneButton({ target, onDone, desktop }: { target: Target; onDone: () => void; desktop: boolean }) {
  const day = useLocalDay()
  const mark = useMarkDone(target.routineId, day)
  return (
    <>
      <button
        type="button"
        disabled={mark.isPending}
        onClick={() => mark.mutate(undefined, { onSuccess: onDone })}
        aria-label={`Realizado: ${target.name}`}
        className={`${outline} px-[18px] ${desktop ? 'ml-auto' : 'self-end'}`}
      >
        {CHILD.done}
      </button>
      {mark.isError && (
        <p role="alert" className="w-full text-[14px] text-body">
          {CHILD.markFailed}
        </p>
      )}
    </>
  )
}

/** The activities of the day in one row: the count, the next one and «✓ Realizado» (design A: no row per activity). */
function ActivitiesRow({ activities, variant }: { activities: Routine[]; variant: Variant }) {
  const [held, setHeld] = useState<{ name: string; time: string } | null>(null)
  useEffect(() => {
    if (!held) return
    const timer = setTimeout(() => setHeld(null), MARKED_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [held])

  const doses = activities.flatMap((r) => r.doses)
  const done = doses.filter((d) => d.taken).length
  const next = earliest(activities, (d) => d.status === 'pending')
  const markable = earliest(activities, (d) => !d.taken)
  const desktop = variant === 'desktop'
  const action = held ? (
    <span className={`${mint} px-3.5 text-[15px] ${desktop ? 'ml-auto' : 'self-end'}`}>{doneLine(held.name, held.time)}</span>
  ) : (
    markable && (
      <DoneButton
        key={markable.routineId}
        target={markable}
        desktop={desktop}
        onDone={() => setHeld({ name: markable.name, time: formatTime(new Date().toISOString()) })}
      />
    )
  )

  if (desktop)
    return (
      <div className="flex flex-wrap items-center gap-3.5 pt-1">
        <DayIcon kind="act" />
        <span className="text-[14px] font-bold text-muted">{CHILD.activities}</span>
        <span className="text-[16px] font-extrabold text-ink">{activitiesDone(done, doses.length)}</span>
        {next && <span className="text-[15px] text-body">· {nextActivity(next.name, formatTime(next.at))}</span>}
        {action}
      </div>
    )
  return (
    <>
      <div className="flex items-start gap-3 pt-2.5">
        <DayIcon kind="act" />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex justify-between gap-2">
            <span className="text-[13px] font-bold text-muted">{CHILD.activities}</span>
            <span className="text-[15px] font-extrabold text-ink">{activitiesDone(done, doses.length)}</span>
          </div>
          {next && <span className="text-[14px] text-body">{nextActivity(next.name, formatTime(next.at))}</span>}
        </div>
      </div>
      {action}
    </>
  )
}

function Skeleton({ variant }: { variant: Variant }) {
  const desktop = variant === 'desktop'
  return (
    <div
      role="status"
      aria-label="Cargando"
      className={`flex flex-col gap-3.5 rounded-[22px] border-[1.5px] border-hint-edge bg-surface ${desktop ? 'h-[300px] p-[22px]' : 'h-[340px] p-4'}`}
    >
      <span className="h-5 w-[60px] rounded-md bg-skel" />
      <span className="h-14 rounded-xl bg-skel" />
      <span className="h-14 rounded-xl bg-skel" />
      <span className="h-14 rounded-xl bg-skel" />
    </div>
  )
}

/**
 * «Hoy» of a child's detail (specs/056, research R5): the day's doses of medications and supplements by Mañana / Tarde / Noche, each
 * markable here, and the activities in one row. Same answers and query keys as the home's card (`useChildDay`), so a mark shows on
 * both. The chips count only the server's `status` (never the phone's clock); nothing is evaluated (Principio I).
 */
export function ChildTodayCard({ childId, childName, variant, canManage }: { childId: string; childName: string; variant: Variant; canManage: boolean }) {
  const { day, overview, activities, isPending, isError, refetch } = useChildDay(childId)
  return (
    <TodayCardView
      variant={variant}
      pending={isPending || !day || !overview}
      failed={isError ? { text: loadFailedDay(childName), onRetry: refetch } : null}
      doses={overview?.doses ?? []}
      activities={activities ?? []}
      toMark={day?.toMark ?? 0}
      canManage={canManage}
    />
  )
}

interface TodayCardViewProps {
  variant: Variant
  pending: boolean
  /** The sentence and the retry when the day couldn't be read. */
  failed: { text: string; onRetry: () => void } | null
  /** The doses of the day (medications and supplements), each markable here. */
  doses: OverviewDose[]
  activities: Routine[]
  /** What came and nobody marked, activities included: the amber chip (the server's `status` only). */
  toMark: number
  /** Who can do everything: may take back a mark somebody else made. */
  canManage: boolean
  /** What «Hoy» says when there is nothing (by default «Hoy no hay tomas ni actividades»); «Mi día» puts its first steps here. */
  empty?: ReactNode
}

/** «Hoy» itself, from the doses and the activities it is given: the child's detail and «Mi día» (specs/056, designs A and B). */
export function TodayCardView({ variant, pending, failed, doses: all, activities, toMark, canManage, empty: emptyContent }: TodayCardViewProps) {
  const desktop = variant === 'desktop'

  if (failed)
    return (
      <section aria-label={CHILD.today} className={`${card} flex flex-col items-start gap-3 ${desktop ? 'px-6 py-[22px]' : 'p-4'}`}>
        <h2 className={`font-extrabold text-ink ${desktop ? 'text-[21px]' : 'text-[20px]'}`}>{CHILD.today}</h2>
        <p role="alert" className="text-[15px] text-body">
          {failed.text}
        </p>
        <button type="button" onClick={failed.onRetry} className={`${outline} px-5`}>
          {CHILD.retry}
        </button>
      </section>
    )
  if (pending) return <Skeleton variant={variant} />

  const doses = all.filter((d) => d.status !== 'canceled')
  const groups = groupByPeriod(doses)
  const unregistered = doses.filter((d) => d.status === 'unregistered' && !d.taken).length
  const active = activities.filter((r) => r.kind === 'activity' && r.status === 'active' && r.doses.length > 0)
  const anything = doses.length > 0 || active.length > 0

  const chips = (
    <>
      {toMark > 0 && (
        <span className={`${chip} inline-flex items-center gap-1.5 bg-pending-soft px-3 py-[5px] text-on-pending-chip`}>
          <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full border-2 border-pending-dot" />
          {toMarkChip(toMark)}
        </span>
      )}
      {anything && toMark === 0 && unregistered === 0 && (
        <span className={`${chip} bg-confirmed-soft px-3 py-[5px] text-confirmed-strong`}>{CHILD.allMarked}</span>
      )}
      {unregistered > 0 && (
        <span className={`${chip} border-[1.5px] border-dashed border-calendar-muted px-3 py-1 text-body`}>{unregisteredChip(unregistered)}</span>
      )}
    </>
  )
  const total = doses.length > 0 && dosesToday(doses.length)
  const empty = !anything && (emptyContent ?? (
    <p
      className={`rounded-2xl border-2 border-dashed border-hint-border text-center text-muted ${desktop ? 'p-[22px] text-[16px]' : 'px-4 py-[18px] text-[15px] leading-normal'}`}
    >
      {CHILD.nothingToday}
    </p>
  ))
  const groupList = (cls: string) =>
    groups.map((g) => (
      <div key={g.key} role="group" aria-label={g.label} className={`flex min-w-0 flex-col ${cls}`}>
        <span className={`text-[12px] font-extrabold tracking-[0.08em] text-action uppercase ${desktop ? 'pb-1' : ''}`}>{g.label}</span>
        <ul className="flex flex-col">
          {g.doses.map((d) => (
            <DoseRow key={d.id} dose={d} variant={variant} canManage={canManage} />
          ))}
        </ul>
      </div>
    ))

  if (desktop)
    return (
      <section aria-labelledby="child-today" className={`${card} flex flex-col gap-3.5 px-6 py-[22px] leading-[normal]`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <h2 id="child-today" className="text-[21px] font-extrabold text-ink">
            {CHILD.today}
          </h2>
          {chips}
          {total && <span className="ml-auto text-[16px] font-bold text-ink">{total}</span>}
        </div>
        {empty}
        {groups.length > 0 && <div className="grid grid-cols-3 gap-7">{groupList('')}</div>}
        {active.length > 0 && <ActivitiesRow activities={active} variant={variant} />}
      </section>
    )

  return (
    <section aria-labelledby="child-today" className={`${card} flex flex-col gap-2 p-4 leading-[normal]`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="child-today" className="text-[20px] font-extrabold text-ink">
          {CHILD.today}
        </h2>
        {total && <span className="text-[15px] font-bold text-ink">{total}</span>}
      </div>
      <div className="flex flex-wrap gap-2 empty:hidden">{chips}</div>
      {empty}
      {groupList('pt-1.5')}
      {active.length > 0 && <ActivitiesRow activities={active} variant={variant} />}
    </section>
  )
}
