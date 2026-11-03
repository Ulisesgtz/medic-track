import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatTime } from '../../shared/date'
import { DayIcon } from '../../shared/ui/DayRow'
import { useLocalDay } from '../../shared/useLocalDay'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { usePersonOverview } from '../profile/hooks'
import { useMarkDone, usePersonalRoutines } from '../supplements/hooks'
import { MARKED_SHOWN_MS } from './ChildDayCard'
import { personalDay, type PersonalNext } from './daySummary'
import { HOME, activitiesDone, doneLine, dosesToday, nextLine } from './homeText'
import type { Account } from './types'

type Variant = 'phone' | 'desktop'

const shadow = 'shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outline =
  'min-h-11 shrink-0 cursor-pointer rounded-[14px] border-2 border-action text-[15px] font-extrabold text-action hover:bg-hint disabled:cursor-default'
const doneChip = 'inline-flex min-h-11 shrink-0 items-center rounded-[14px] bg-confirmed-soft text-[15px] font-extrabold text-confirmed-strong'

/** «✓ Realizado» of the activity whose dose comes next (specs/035: the server marks the earliest unmarked of the day). */
function DoneButton({ target, onDone, desktop }: { target: PersonalNext; onDone: () => void; desktop: boolean }) {
  const day = useLocalDay()
  const mark = useMarkDone(target.routineId, day)
  return (
    <button
      type="button"
      disabled={mark.isPending}
      onClick={() => mark.mutate(undefined, { onSuccess: onDone })}
      aria-label={`Realizado: ${target.name}`}
      className={`${outline} ${desktop ? 'px-4' : 'self-end px-[18px]'}`}
    >
      {HOME.done}
    </button>
  )
}

function Bar({ marked, total }: { marked: number; total: number }) {
  return (
    <div role="progressbar" aria-label={HOME.myDoses} aria-valuemin={0} aria-valuemax={total} aria-valuenow={marked} className="h-1.5 rounded-full bg-hint">
      <div className="h-full rounded-full bg-action" style={{ width: `${total ? Math.round((marked / total) * 100) : 0}%` }} />
    </div>
  )
}

/**
 * «Tu día» (specs/055, US2): the person's own supplements and activities of today, first on the home. Counts and the next of
 * each, «✓ Realizado» for the next activity; one line when the person created none (with the plan's mark on the free plan).
 */
export function TuDia({ account, variant }: { account: Account; variant: Variant }) {
  const desktop = variant === 'desktop'
  const navigate = useNavigate()
  const day = useLocalDay()
  const supplements = usePersonalRoutines(account.id, 'supplement', day)
  const activities = usePersonalRoutines(account.id, 'activity', day)
  // The doses of the person's own medications (specs/058); without them (an error) «Tu día» still shows the rest.
  const own = usePersonOverview(account.id, day)
  const [planOpen, setPlanOpen] = useState(false)
  const [held, setHeld] = useState<{ name: string; time: string } | null>(null)
  useEffect(() => {
    if (!held) return
    const timer = setTimeout(() => setHeld(null), MARKED_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [held])

  if (supplements.isPending || activities.isPending)
    return (
      <div
        aria-hidden="true"
        className={`rounded-[22px] border-[1.5px] border-hint-edge bg-surface ${desktop ? 'grid h-[196px] grid-cols-2 gap-6 p-[22px]' : 'flex h-[236px] flex-col gap-3.5 p-[18px]'}`}
      >
        {desktop ? (
          <>
            <span className="rounded-xl bg-skel" />
            <span className="rounded-xl bg-skel" />
          </>
        ) : (
          <>
            <span className="h-[18px] w-20 rounded-md bg-skel" />
            <span className="h-[52px] rounded-xl bg-skel" />
            <span className="h-[52px] rounded-xl bg-skel" />
            <span className="h-11 w-[120px] self-end rounded-[14px] bg-skel" />
          </>
        )}
      </div>
    )

  if (supplements.isError || activities.isError)
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-hint-edge px-4 py-3 text-[15px] text-body">
        <span>
          <strong className="text-ink">{HOME.dayTitle}</strong> · {HOME.loadFailedMine}
        </span>
        <button
          type="button"
          onClick={() => {
            if (supplements.isError) void supplements.refetch()
            if (activities.isError) void activities.refetch()
          }}
          className={`${outline} px-4`}
        >
          {HOME.retry}
        </button>
      </div>
    )

  const paidPlan = (supplements.data?.paidPlan ?? false) || (activities.data?.paidPlan ?? false)
  const mine = personalDay(supplements.data?.routines ?? [], activities.data?.routines ?? [], paidPlan, own.data?.doses ?? [])

  if (mine.mode === 'vacio')
    return (
      <p className={`rounded-2xl border-[1.5px] border-hint-edge text-[15px] leading-normal text-body ${desktop ? 'px-[18px] py-3.5' : 'px-4 py-3'}`}>
        {HOME.dayTitle} ·{' '}
        <Link to="/yo" className="font-bold text-action hover:underline">
          {HOME.addOwn}
        </Link>
      </p>
    )

  if (mine.mode === 'plan')
    return (
      <>
        <button
          type="button"
          onClick={() => setPlanOpen(true)}
          className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-hint-border bg-surface text-left ${desktop ? 'px-5' : 'justify-between px-4'}`}
        >
          <span className="text-[15px] text-body">
            <strong className="text-ink">{HOME.dayTitle}</strong> · {HOME.planLine}
          </span>
          <span className="shrink-0 rounded-full border border-hint-border bg-hint px-2.5 py-1 text-[12px] font-extrabold text-action">
            {HOME.planBadge}
          </span>
        </button>
        {planOpen && <FreemiumLimitModal reason="supplements" onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
      </>
    )

  const title = desktop ? 'text-[19px]' : 'text-[18px]'
  const allChip = (
    <span className={`self-start rounded-full bg-confirmed-soft text-[14px] font-extrabold text-confirmed-strong ${desktop ? 'px-3 py-[5px]' : 'px-3 py-1.5'}`}>
      {HOME.allMarked}
    </span>
  )
  const label = `font-bold text-muted ${desktop ? 'text-[14px]' : 'text-[13px]'}`
  const value = `font-extrabold text-ink ${desktop ? 'text-[16px]' : 'text-[15px]'}`
  const line = `text-body ${desktop ? 'text-[15px]' : 'text-[14px]'}`

  const dosesBlock = mine.doses && (
    <div className={`flex items-start ${desktop ? 'gap-3.5' : 'gap-3'}`}>
      <DayIcon kind="sup" size={desktop ? 'md' : 'sm'} />
      <div className={`flex min-w-0 flex-1 flex-col ${desktop ? 'gap-2' : 'gap-1.5'}`}>
        <div className="flex justify-between gap-2">
          <span className={label}>{HOME.myDoses}</span>
          <span className={value}>{dosesToday(mine.doses.marked, mine.doses.total)}</span>
        </div>
        <Bar marked={mine.doses.marked} total={mine.doses.total} />
        {mine.doses.next && <span className={line}>{nextLine(mine.doses.next.name, formatTime(mine.doses.next.at))}</span>}
      </div>
    </div>
  )

  const markable = mine.activities?.markable ?? null
  const action = held ? (
    <span className={`${doneChip} ${desktop ? 'px-3.5' : 'self-end px-4'}`}>{desktop ? `✓ ${held.time}` : doneLine(held.name, held.time)}</span>
  ) : (
    markable && <DoneButton key={markable.routineId} target={markable} desktop={desktop} onDone={() => setHeld({ name: markable.name, time: formatTime(new Date()) })} />
  )

  const activitiesBlock = mine.activities && (
    <div className={`flex items-start ${desktop ? 'gap-3.5' : 'gap-3'}`}>
      <DayIcon kind="act" size={desktop ? 'md' : 'sm'} />
      <div className={`flex min-w-0 flex-1 flex-col ${desktop ? 'gap-2' : 'gap-1'}`}>
        <div className="flex justify-between gap-2">
          <span className={label}>{HOME.myActivities}</span>
          <span className={value}>{activitiesDone(mine.activities.done, mine.activities.total)}</span>
        </div>
        {desktop ? (
          <div className="flex items-center justify-between gap-3">
            {mine.activities.next && <span className={line}>{nextLine(mine.activities.next.name, formatTime(mine.activities.next.at))}</span>}
            {action}
          </div>
        ) : (
          mine.activities.next && <span className={line}>{nextLine(mine.activities.next.name, formatTime(mine.activities.next.at))}</span>
        )}
      </div>
    </div>
  )

  return (
    <section aria-labelledby="tu-dia-title" className={`flex flex-col rounded-[22px] bg-surface ${shadow} ${desktop ? 'gap-4 px-6 py-[22px]' : 'gap-3.5 p-[18px]'}`}>
      <div className={`flex items-center ${desktop ? 'gap-3.5' : 'justify-between'}`}>
        <h2 id="tu-dia-title" className={`font-extrabold text-ink ${title}`}>
          {HOME.dayTitle}
        </h2>
        {desktop && mine.mode === 'todo' && allChip}
        <Link to="/yo" className={`inline-flex min-h-11 items-center text-[14px] font-bold text-action hover:underline ${desktop ? 'ml-auto' : ''}`}>
          {HOME.seeAll}
        </Link>
      </div>
      {!desktop && mine.mode === 'todo' && allChip}
      {mine.mode === 'nada' && <span className="text-[15px] text-muted">{HOME.nothingTodayMine}</span>}
      {desktop ? (
        (dosesBlock || activitiesBlock) && (
          <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-6">
            {dosesBlock ?? <span />}
            <span className="bg-hint-edge" />
            {activitiesBlock ?? <span />}
          </div>
        )
      ) : (
        <>
          {dosesBlock}
          {dosesBlock && activitiesBlock && <span className="h-px bg-hint-edge" />}
          {activitiesBlock}
          {action}
        </>
      )}
    </section>
  )
}
