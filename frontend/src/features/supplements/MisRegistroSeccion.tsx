import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLocalDay } from '../../shared/useLocalDay'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { dayKey } from '../consultations/treatmentDays'
import { PlanAvisoCompacto } from '../plans/PlanAvisoCompacto'
import { RoutineCard } from './RoutineCard'
import { useAcknowledgePersonalNotice, usePersonalRoutines } from './hooks'
import { SECTION_COPY } from './sectionCopy'
import type { RoutineKind } from './types'

const sectionButton =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

/**
 * The first-time notice (mock A1/A2): a `hint` block inside the page, not a dialog — it is read next to what it is about and
 * blocks nobody who only wants to mark a dose. It only says what the app does: it records what the person writes (Principio I).
 */
function FirstTimeNotice({ kind, onAcknowledge, busy, failed }: { kind: RoutineKind; onAcknowledge: () => void; busy: boolean; failed: boolean }) {
  return (
    <div role="note" className="flex flex-col items-start gap-2 rounded-[22px] border-[1.5px] border-hint-border bg-hint px-5 py-[18px]">
      <p className="text-[17px] font-extrabold text-ink">Antes de empezar</p>
      <p className="text-[15px] leading-relaxed text-body">
        PediTrack solo recuerda lo que tú registras: el nombre, las horas y las fechas que escribas. {SECTION_COPY[kind].noSuggest}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onAcknowledge}
        className="mt-1 inline-flex min-h-11 cursor-pointer items-center rounded-2xl border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Entendido
      </button>
      {failed && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          No se pudo guardar. Inténtalo de nuevo.
        </p>
      )}
    </div>
  )
}

/**
 * «Mis suplementos» and «Mis actividades» (mock RegistroSeccion, personal scope): the person's own, apart from the children, each
 * on its own page. Same cards as a child's section with its own words. Who sees what: with the paid plan — their own, or the one of
 * the family they were invited to — «+ Agregar …» (or the cap block at 10 active of this kind); with none and no plan, the plan
 * notice; with some and no plan, a notice that what exists stays and is markable. What was created is never hidden, whatever the plan.
 */
export function MisRegistroSeccion({ kind }: { kind: RoutineKind }) {
  const copy = SECTION_COPY[kind]
  const navigate = useNavigate()
  const day = useLocalDay()
  const today = dayKey(day.from)
  const accountQuery = useCurrentAccount()
  const account = accountQuery.data
  const query = usePersonalRoutines(account?.id, kind, day)
  const acknowledge = useAcknowledgePersonalNotice(account?.id ?? '')
  const [reopened, setReopened] = useState(false)
  const [ackFailed, setAckFailed] = useState(false)
  const list = query.data

  if (query.isPending || !account) return <p className="text-[15px] text-slate-600">Cargando…</p>
  if (query.isError || !list) return <p className="text-[15px] text-slate-600">{copy.personalLoadFailed}</p>

  const active = list.routines.filter((r) => r.status === 'active')
  const inactive = list.routines.filter((r) => r.status !== 'active')
  const atCap = list.activeCount >= list.limit
  const hasRoutines = list.routines.length > 0
  const newPath = copy.newPath(null)
  const showNotice = !list.noticeSeen || reopened
  // Using the plan of the family they were invited to (their own account is not paid).
  const usesFamilyPlan = list.paidPlan && account.plan !== 'paid'

  const understood = () => {
    setAckFailed(false)
    if (list.noticeSeen) {
      setReopened(false)
      return
    }
    acknowledge.mutate(undefined, { onError: () => setAckFailed(true) })
  }

  return (
    <section aria-labelledby={`personal-${kind}-title`} className="flex min-w-0 flex-col gap-4">
      <h2 id={`personal-${kind}-title`} className="sr-only">
        {copy.personalTitle}
      </h2>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[15px] leading-normal text-body">{copy.privacy}</p>
        {list.activeCount > 0 && <span className="text-sm font-bold text-slate-600">{copy.count(list.activeCount)}</span>}
      </div>

      {showNotice && <FirstTimeNotice kind={kind} onAcknowledge={understood} busy={acknowledge.isPending} failed={ackFailed} />}

      {usesFamilyPlan && <p className="text-sm leading-normal text-slate-600">{copy.usesFamilyPlan}</p>}

      {list.paidPlan && !atCap && hasRoutines && (
        <Link
          to={newPath}
          className="inline-flex min-h-14 cursor-pointer items-center justify-center rounded-[22px] border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          {copy.add}
        </Link>
      )}

      {!hasRoutines && list.paidPlan && (
        <div className="flex flex-col items-start gap-2.5 rounded-[22px] border-2 border-dashed border-hint-border px-[22px] py-6">
          <h3 className="text-lg font-black tracking-[-0.02em] text-ink">{copy.personalEmptyTitle}</h3>
          <p className="text-[15px] leading-relaxed text-body">{copy.personalEmptyText}</p>
          <Link
            to={newPath}
            className="mt-1 inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-confirmed px-[22px] text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2"
          >
            {copy.add}
          </Link>
        </div>
      )}

      {!hasRoutines && !list.paidPlan && <PlanAvisoCompacto title={copy.personalPlanTitle} text={copy.personalPlanText} />}

      {hasRoutines && !list.paidPlan && (
        <div role="status" className="flex flex-col gap-1.5 rounded-[22px] border-[1.5px] border-hint-border bg-hint px-5 py-[18px]">
          <p className="text-[17px] font-extrabold text-ink">Tu cuenta está en el plan gratuito</p>
          <p className="text-[15px] leading-relaxed text-body">{copy.lapsedText}</p>
          <button type="button" onClick={() => navigate('/planes')} className={`mt-1 self-start ${sectionButton} hover:bg-surface`}>
            Ver el plan completo
          </button>
        </div>
      )}

      {list.paidPlan && atCap && (
        <div role="status" className="flex flex-col items-start gap-2 rounded-[22px] border-[1.5px] border-hint-border bg-hint px-5 py-[18px]">
          <p className="text-[17px] font-extrabold text-ink">{copy.capTitle(list.limit)}</p>
          <p className="text-[15px] leading-relaxed text-body">{copy.capText(null)}</p>
          <a
            href={`#mis-${copy.anchor}`}
            className="mt-1 inline-flex min-h-11 items-center rounded-2xl border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            {copy.capLink}
          </a>
        </div>
      )}

      {active.length > 0 && (
        <div id={`mis-${copy.anchor}`} className="flex scroll-mt-4 flex-col gap-4">
          <p className="mt-1 text-xs font-extrabold tracking-[0.1em] text-action uppercase">{copy.activeList}</p>
          {active.map((r) => (
            <RoutineCard key={r.id} routine={r} today={today} canManage />
          ))}
        </div>
      )}
      {inactive.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="mt-2 text-xs font-extrabold tracking-[0.1em] text-action uppercase">{copy.inactiveList}</p>
          {inactive.map((r) => (
            <RoutineCard key={r.id} routine={r} today={today} canManage />
          ))}
        </div>
      )}

      {!showNotice && (
        <button
          type="button"
          onClick={() => setReopened(true)}
          className="inline-flex min-h-11 cursor-pointer items-center self-start text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          {copy.howItWorks}
        </button>
      )}
    </section>
  )
}
