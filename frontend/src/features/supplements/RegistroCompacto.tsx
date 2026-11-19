import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DayIcon } from '../../shared/ui/DayRow'
import { useLocalDay } from '../../shared/useLocalDay'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { CHILD, addRoutine, emptyRoutines, planRoutines } from '../childDetail/childDetailText'
import { useActivityTypes } from '../../shared/catalog/useCatalog'
import { emptyActivities } from './activityTypeText'
import { ActivitySegmentCard } from './ActivitySegments'
import { groupByActivityType } from './groupByActivityType'
import { usePersonalRoutines, useRoutineAccess, useRoutines } from './hooks'
import { MY_DAY } from './myDayText'
import { routineFrequency, routineStatusLabel } from './scheduleText'
import { SECTION_COPY } from './sectionCopy'
import type { Routine, RoutineKind } from './types'

type Variant = 'phone' | 'desktop'

const card = 'overflow-hidden rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const planChip = 'shrink-0 rounded-full border border-hint-border bg-hint px-[9px] py-[3px] text-[12px] font-extrabold text-action'

function Row({ routine, variant }: { routine: Routine; variant: Variant }) {
  const to = `${routine.kind === 'activity' ? '/actividades' : '/suplementos'}/${routine.id}`
  const status = <span className="shrink-0 rounded-full border border-hint-border px-2.5 py-[3px] text-[13px] font-bold text-body">{routineStatusLabel(routine.kind, routine.status)}</span>
  const icon = <DayIcon kind={routine.kind === 'activity' ? 'act' : 'sup'} />
  const chevron = (
    <span aria-hidden="true" className="text-[22px] text-action">
      ›
    </span>
  )
  if (variant === 'desktop')
    return (
      <Link to={to} className="flex min-h-[60px] items-center gap-3.5 border-b border-hint-edge px-5 py-2.5 last:border-b-0 hover:bg-canvas">
        {icon}
        <span className="w-40 shrink-0 text-[15px] font-extrabold text-ink [overflow-wrap:anywhere]">{routine.name}</span>
        <span className="min-w-0 flex-1 text-[14px] text-body">{routineFrequency(routine)}</span>
        {status}
        {chevron}
      </Link>
    )
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 border-b border-hint-edge px-4 py-2.5 last:border-b-0">
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-extrabold text-ink [overflow-wrap:anywhere]">{routine.name}</span>
        <span className="text-[14px] text-body">{routineFrequency(routine)}</span>
      </span>
      {status}
      {chevron}
    </Link>
  )
}

/**
 * «Suplementos» or «Actividades» of a child's detail, and «Mis suplementos» / «Mis actividades» of «Mi día» (`personal`), since
 * specs/056 (designs A and B): one compact row per routine — name, how often and its state in neutral words, «›» to its detail —
 * and never its doses, which live in «Hoy». Who adds: a Tutor with the paid plan, or the person on their own plan («+ Agregar …»);
 * on the free plan the row with the «Plan completo» mark opens the plan notice. What was created is always listed.
 */
export function RegistroCompacto({
  kind,
  childId,
  personal = false,
  sectionId,
  variant,
}: {
  kind: RoutineKind
  /** The child's; absent for the person's own. */
  childId?: string
  personal?: boolean
  sectionId: string
  variant: Variant
}) {
  const copy = SECTION_COPY[kind]
  const day = useLocalDay()
  const navigate = useNavigate()
  const accountQuery = useCurrentAccount()
  const childQuery = useRoutines(personal ? undefined : childId, kind, day)
  const personalQuery = usePersonalRoutines(personal ? accountQuery.data?.id : undefined, kind, day)
  const query = personal ? personalQuery : childQuery
  const list = query.data
  const childAccess = useRoutineAccess(accountQuery.data, personal ? undefined : childId, list?.paidPlan)
  // The person's own: their plan (or their paid family's) decides, never a role (specs/033 part 3).
  const access = personal ? { canCreate: list?.paidPlan === true, showPlan: list?.paidPlan === false } : childAccess
  // specs/075: «Actividades» is split into one segment per type; without the catalog the list stays whole, as before.
  const activityTypes = useActivityTypes()
  const [planOpen, setPlanOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const closePlan = useCallback(() => setPlanOpen(false), [])
  const desktop = variant === 'desktop'

  const name = personal ? (kind === 'activity' ? MY_DAY.myActivities : MY_DAY.mySupplements) : kind === 'activity' ? CHILD.activities : CHILD.supplements
  // Mock A (specs/075): «Actividades» carries its «+ Agregar actividad» in the header row, in outline; the rest of the sections keep theirs below.
  const addInHeader = kind === 'activity'
  const title = (
    <h2 className={`flex min-h-11 items-center text-ink ${addInHeader ? (desktop ? 'text-xl font-black tracking-[-0.02em]' : 'text-[18px] font-extrabold tracking-[-0.02em]') : `font-extrabold ${desktop ? 'text-[19px]' : 'text-[18px]'}`}`}>
      {name}
    </h2>
  )
  const headerAdd =
    addInHeader && list && access.canCreate && list.activeCount < list.limit ? (
      <Link
        to={copy.newPath(personal ? null : (childId ?? null))}
        className={`inline-flex min-h-11 items-center justify-center rounded-[14px] border-2 border-action bg-transparent font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 ${desktop ? 'px-[18px] text-[15px]' : 'px-3 text-[14px]'}`}
      >
        {addRoutine(kind)}
      </Link>
    ) : null
  const body = () => {
    if (query.isPending) return <p className="text-[15px] text-muted">Cargando…</p>
    if (query.isError || !list) return <p className="text-[15px] text-body">{personal ? copy.personalLoadFailed : copy.loadFailed}</p>
    const routines = [...list.routines].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
    const atCap = list.activeCount >= list.limit
    const segments = kind === 'activity' ? groupByActivityType(routines, activityTypes.data) : null
    return (
      <>
        {routines.length > 0 ? (
          segments ? (
            segments.map((segment) => <ActivitySegmentCard key={segment.code} segment={segment} variant={variant} />)
          ) : (
            <div className={card}>
              {routines.map((r) => (
                <Row key={r.id} routine={r} variant={variant} />
              ))}
            </div>
          )
        ) : kind === 'activity' ? (
          <div className={`flex flex-col gap-1.5 rounded-[22px] border-2 border-dashed border-hint-border ${desktop ? 'p-6' : 'px-[18px] py-5'}`}>
            <span className="text-[17px] font-extrabold text-ink">{emptyActivities.title}</span>
            <p className="m-0 text-[15px] leading-[1.55] text-body">
              {emptyActivities.text(personal ? null : (accountQuery.data?.children.find((c) => c.id === childId)?.firstName ?? null))}
            </p>
          </div>
        ) : (
          <p className="text-[15px] text-muted">{personal ? MY_DAY.emptySupplements : emptyRoutines(kind)}</p>
        )}
        {access.canCreate && !atCap && !addInHeader && (
          <Link
            to={copy.newPath(personal ? null : (childId ?? null))}
            className={`inline-flex items-center justify-center border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action hover:bg-hint ${desktop ? 'min-h-11 self-start rounded-[14px] px-[18px]' : 'min-h-[52px] rounded-2xl'}`}
          >
            {addRoutine(kind)}
          </Link>
        )}
        {access.canCreate && atCap && <p className="text-[15px] text-body">{copy.capTitle(list.limit)}</p>}
        {access.showPlan && (
          <button
            ref={opener}
            type="button"
            onClick={() => setPlanOpen(true)}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 text-left ${desktop ? 'min-h-12 self-start' : 'min-h-[52px] justify-between'}`}
          >
            <strong className="text-[15px] text-ink">{planRoutines(kind)}</strong>
            <span className={planChip}>{CHILD.planMark}</span>
          </button>
        )}
      </>
    )
  }

  return (
    <section id={sectionId} aria-label={name} className={`flex scroll-mt-16 flex-col ${desktop || (addInHeader && (list?.routines.length ?? 0) > 0) ? 'gap-3' : 'gap-2.5'}`}>
      {addInHeader ? (
        <div className="flex items-center justify-between gap-2.5">
          {title}
          {headerAdd}
        </div>
      ) : (
        title
      )}
      {body()}
      {planOpen && <FreemiumLimitModal reason="supplements" onStayFree={closePlan} onViewPlans={() => navigate('/planes')} opener={opener} />}
    </section>
  )
}
