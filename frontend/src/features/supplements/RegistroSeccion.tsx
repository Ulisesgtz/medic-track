import { Link } from 'react-router-dom'
import { useLocalDay } from '../../shared/useLocalDay'
import { dayKey } from '../consultations/treatmentDays'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { PlanAvisoCompacto } from '../plans/PlanAvisoCompacto'
import { RoutineCard } from './RoutineCard'
import { useRoutineAccess, useRoutines } from './hooks'
import { SECTION_COPY, emptyChildText } from './sectionCopy'
import type { RoutineKind } from './types'

const sectionButton =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

/**
 * The «Suplementos» or «Actividades» section of a child's detail (mock RegistroSeccion), one under the other, in both designs. What
 * is listed is the parent's own words: nothing here suggests a supplement, an activity, a dose or a time (Principio I). Who sees
 * what: a Tutor adds (with the paid plan: otherwise the plan notice; with 10 active of this kind, the cap block), a Caregiver sees,
 * marks and chooses their own reminders. What was already created is always shown and markable, whatever the plan.
 */
export function RegistroSeccion({ kind, childId, childName }: { kind: RoutineKind; childId: string; childName: string }) {
  const copy = SECTION_COPY[kind]
  const titleId = `${kind}-section-title`
  const day = useLocalDay()
  const today = dayKey(day.from)
  const accountQuery = useCurrentAccount()
  const query = useRoutines(childId, kind, day)
  const list = query.data
  const access = useRoutineAccess(accountQuery.data, childId, list?.paidPlan)
  const childAccess = useChildAccess(accountQuery.data, childId)
  const newPath = copy.newPath(childId)

  if (query.isPending || query.isError || !list) {
    return (
      <section aria-labelledby={titleId} className="flex flex-col gap-4">
        <h2 id={titleId} className="text-xl font-black tracking-[-0.02em] text-ink">
          {copy.title}
        </h2>
        <p className="text-[15px] text-slate-600">{query.isPending ? 'Cargando…' : copy.loadFailed}</p>
      </section>
    )
  }

  const active = list.routines.filter((r) => r.status === 'active')
  const inactive = list.routines.filter((r) => r.status !== 'active')
  const atCap = list.activeCount >= list.limit
  const canManage = childAccess.canAdd

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-xl font-black tracking-[-0.02em] text-ink">
          {copy.title}
        </h2>
        {list.activeCount > 0 && <span className="text-sm font-bold text-slate-600">{copy.count(list.activeCount)}</span>}
      </div>

      {access.isViewer && list.routines.length > 0 && <p className="-mt-1.5 text-[15px] leading-normal text-body">{copy.viewerNote}</p>}

      {access.canCreate && !atCap && list.routines.length > 0 && (
        <Link
          to={newPath}
          className="inline-flex min-h-14 cursor-pointer items-center justify-center rounded-[22px] border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          {copy.add}
        </Link>
      )}

      {list.routines.length === 0 && !access.showPlan && (
        <div className="flex flex-col items-start gap-2.5 rounded-[22px] border-2 border-dashed border-hint-border px-[22px] py-6">
          <h3 className="text-lg font-black tracking-[-0.02em] text-ink">{copy.emptyChildTitle(childName)}</h3>
          <p className="text-[15px] leading-relaxed text-body">{access.canCreate ? emptyChildText(kind, childName) : copy.emptyChildViewerText}</p>
          {access.canCreate && (
            <Link to={newPath} className={`mt-1 ${sectionButton}`}>
              {copy.add}
            </Link>
          )}
        </div>
      )}

      {access.canCreate && atCap && (
        <div role="status" className="flex flex-col items-start gap-2 rounded-[22px] border-[1.5px] border-hint-border bg-hint px-5 py-[18px]">
          <p className="text-[17px] font-extrabold text-ink">{copy.capTitle(list.limit)}</p>
          <p className="text-[15px] leading-relaxed text-body">{copy.capText(childName)}</p>
          <a
            href={`#${copy.anchor}`}
            className="mt-1 inline-flex min-h-11 items-center rounded-2xl border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            {copy.capLink}
          </a>
        </div>
      )}

      {access.showPlan && <PlanAvisoCompacto title={copy.planTitle} text={copy.planText(childName)} />}

      {active.length > 0 && (
        <div id={copy.anchor} className="flex scroll-mt-4 flex-col gap-4">
          <p className="mt-1 text-xs font-extrabold tracking-[0.1em] text-action uppercase">{copy.activeList}</p>
          {active.map((r) => (
            <RoutineCard key={r.id} routine={r} today={today} canManage={canManage} />
          ))}
        </div>
      )}
      {inactive.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="mt-2 text-xs font-extrabold tracking-[0.1em] text-action uppercase">{copy.inactiveList}</p>
          {inactive.map((r) => (
            <RoutineCard key={r.id} routine={r} today={today} canManage={canManage} />
          ))}
        </div>
      )}
    </section>
  )
}
