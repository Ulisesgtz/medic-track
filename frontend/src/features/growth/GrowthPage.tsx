import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { ConfirmDialog } from '../family/ConfirmDialog'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { formatDateShort } from '../../shared/date'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { GrowthApiError } from './api'
import { GrowthChart } from './GrowthChart'
import { ageAt } from './growthAge'
import { GROWTH, authorLine, countLine, valuesLine } from './growthText'
import { useDeleteMeasurement, useGrowth, useGrowthChart, useSetReferenceSex } from './hooks'
import type { Indicator, Measurement, ReferenceSex } from './types'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const badge = 'rounded-full border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-xs font-extrabold tracking-[0.06em] text-action uppercase'
const outline =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[14px] border-2 border-action bg-surface px-4 text-[15px] font-extrabold text-action hover:bg-hint'
const textButton = 'min-h-11 cursor-pointer text-[15px] font-extrabold text-action hover:underline'

/**
 * `/children/:childId/crecimiento` (specs/063, no mock: the visual system). The measurements written down, newest first (every plan),
 * and the chart over the WHO reference (the paid plan; the server decides). Two designs by `useIsDesktop`: one column on the phone;
 * on the web the chart at the left and the list at the right. A Caregiver only sees. Nothing says where the child stands.
 */
export function GrowthPage() {
  const { childId = '' } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { isDesktop } = useSidebarSession()
  const desktop = isDesktop
  const variant = desktop ? 'desktop' : 'phone'
  const accountQuery = useCurrentAccount()
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const growth = useGrowth(childId)
  const data = growth.data
  const canEdit = data?.canEdit ?? false
  const chartAvailable = data?.chartAvailable ?? false
  const chart = useGrowthChart(childId, chartAvailable)
  const setSex = useSetReferenceSex(childId)
  const remove = useDeleteMeasurement(childId)
  const [indicator, setIndicator] = useState<Indicator>('weight')
  const [planOpen, setPlanOpen] = useState(false)
  const [changingTable, setChangingTable] = useState(false)
  const [removing, setRemoving] = useState<Measurement | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const planRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const planBlocked = chart.error instanceof GrowthApiError && chart.error.kind === 'plan_required'

  const addLink = canEdit ? (
    <Link to={`/children/${childId}/crecimiento/nueva`} className={`${pageHeaderButton('primary', variant)} ${desktop ? '' : 'w-full'}`}>
      {GROWTH.add}
    </Link>
  ) : undefined

  const chooseTable = (sex: ReferenceSex) => setSex.mutate(sex, { onSuccess: () => setChangingTable(false) })
  const tableChoice = (
    <div className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-hint-border bg-hint p-4">
      <span className="text-[15px] font-extrabold text-ink">{GROWTH.chooseTableTitle}</span>
      <span className="text-[14px] leading-normal text-body">{GROWTH.chooseTableBody}</span>
      <div className="flex gap-2">
        <button type="button" disabled={setSex.isPending} onClick={() => chooseTable('female')} className={`${outline} flex-1`}>
          {GROWTH.girls}
        </button>
        <button type="button" disabled={setSex.isPending} onClick={() => chooseTable('male')} className={`${outline} flex-1`}>
          {GROWTH.boys}
        </button>
      </div>
      {setSex.isError && (
        <p role="alert" className="text-[14px] text-body">
          {GROWTH.tableFailed}
        </p>
      )}
    </div>
  )

  const tabs = (
    <div role="group" aria-label={GROWTH.chartTitle} className="grid grid-cols-2 gap-1.5">
      {(['weight', 'height'] as const).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={indicator === k}
          onClick={() => setIndicator(k)}
          className={`min-h-11 cursor-pointer rounded-xl border-[1.5px] px-3 text-[15px] font-extrabold ${indicator === k ? 'border-ink bg-ink text-white' : 'border-calendar-muted bg-surface text-ink'}`}
        >
          {k === 'weight' ? GROWTH.weight : GROWTH.height}
        </button>
      ))}
    </div>
  )

  const chartSection = (
    <section aria-label={GROWTH.chartTitle} className={`${card} flex flex-col gap-3.5 ${desktop ? 'p-6' : 'p-4'}`}>
      <h2 className="text-[17px] font-extrabold text-ink">{GROWTH.chartTitle}</h2>
      {(!chartAvailable || planBlocked) && !canEdit ? (
        <p className="text-[14px] leading-normal text-body">{GROWTH.chartFamilyPlan}</p>
      ) : !chartAvailable || planBlocked ? (
        <button ref={planRef} type="button" onClick={() => setPlanOpen(true)} className={`${outline} justify-between gap-3`}>
          <span>{GROWTH.showChart}</span>
          <span className={badge}>{GROWTH.planBadge}</span>
        </button>
      ) : chart.isPending ? (
        <div aria-busy="true" aria-label={GROWTH.chartLoading} className={`rounded-xl bg-skel ${desktop ? 'h-[360px]' : 'h-[260px]'}`} />
      ) : chart.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[14px] text-body">{GROWTH.chartFailed}</p>
          <button type="button" onClick={() => void chart.refetch()} className={textButton}>
            {GROWTH.retry}
          </button>
        </div>
      ) : (
        <>
          {(!chart.data.referenceSex || changingTable) && canEdit && tableChoice}
          {!chart.data.referenceSex && !canEdit && <p className="text-[14px] leading-normal text-body">{GROWTH.tableFromAdult}</p>}
          {chart.data.referenceSex && !changingTable && (
            <div className="flex flex-wrap items-center gap-x-3 text-[14px] text-body">
              <span>{GROWTH.tableIs(chart.data.referenceSex)}</span>
              {canEdit && (
                <button type="button" onClick={() => setChangingTable(true)} className={textButton}>
                  {GROWTH.changeTable}
                </button>
              )}
            </div>
          )}
          {tabs}
          <GrowthChart chart={chart.data} indicator={indicator} desktop={desktop} />
          {chart.data.reference && !chart.data.reference.available && <p className="text-[13px] leading-normal text-body">{GROWTH.referenceOff}</p>}
          <p className="text-[13px] leading-normal text-body">{GROWTH.fixedNote}</p>
        </>
      )}
    </section>
  )

  const registered = data?.registered && (
    <div className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-dashed border-hint-border bg-surface p-4 text-[14px] leading-normal text-body">
      <span>
        {GROWTH.registeredLead(child?.firstName ?? '')} <strong className="text-ink">{valuesLine(data.registered.weightKg, data.registered.heightCm)}</strong>
      </span>
      {canEdit && (
        <Link
          to={`/children/${childId}/crecimiento/nueva`}
          state={{ registered: data.registered }}
          className="min-h-11 self-start pt-2.5 text-[15px] font-extrabold text-action hover:underline"
        >
          {GROWTH.registeredAction}
        </Link>
      )}
    </div>
  )

  const row = (m: Measurement, first: boolean) => (
    <li key={m.id} className={`flex flex-col gap-1 px-4 py-3.5 ${first ? '' : 'border-t border-hint-edge'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[16px] font-extrabold text-ink">{valuesLine(m.weightKg, m.heightCm)}</span>
        <span className="text-[14px] text-body">
          {formatDateShort(m.measuredOn)} · {data ? ageAt(data.birthDate, m.measuredOn) : ''}
        </span>
      </div>
      {m.note && <span className="text-[14px] leading-normal text-body [overflow-wrap:anywhere]">{m.note}</span>}
      <span className="text-[13px] text-muted">{authorLine(m)}</span>
      {canEdit && (
        <div className="flex gap-4">
          <Link to={`/children/${childId}/crecimiento/${m.id}/editar`} className={textButton} aria-label={`${GROWTH.correct} ${formatDateShort(m.measuredOn)}`}>
            {GROWTH.correct}
          </Link>
          <button
            type="button"
            onClick={(e) => {
              removeRef.current = e.currentTarget
              setRemoveError(null)
              setRemoving(m)
            }}
            className={textButton}
            aria-label={`${GROWTH.remove} ${formatDateShort(m.measuredOn)}`}
          >
            {GROWTH.remove}
          </button>
        </div>
      )}
    </li>
  )

  const list =
    data &&
    (data.measurements.length === 0 ? (
      <div className="flex flex-col items-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-hint-border px-5 py-7 text-center">
        <span className="text-[17px] font-extrabold text-ink">{GROWTH.emptyTitle}</span>
        <span className="text-[14px] leading-normal text-body">{GROWTH.emptyBody}</span>
      </div>
    ) : (
      <section aria-label={GROWTH.listTitle} className="flex flex-col gap-2">
        <span className="text-[14px] font-bold text-muted">{countLine(data.measurements.length)}</span>
        <ul className={`${card} overflow-hidden`}>{data.measurements.map((m, i) => row(m, i === 0))}</ul>
      </section>
    ))

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={childId}
      backLabel={child ? GROWTH.backChild(child.firstName) : '← Inicio'}
      backTo={child ? `/children/${childId}` : '/home'}
      title={GROWTH.title}
      subtitle={child ? `${child.firstName} · ${GROWTH.subtitle}` : GROWTH.subtitle}
      actions={growth.isSuccess ? addLink : undefined}
      state={growth.isError ? 'error' : growth.isPending ? 'loading' : undefined}
      errorWhat={GROWTH.loadFailed}
      onRetry={() => void growth.refetch()}
    >
      {growth.isSuccess && !canEdit && <p className="rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 py-3.5 text-[14px] leading-normal text-body">{GROWTH.caregiverNote}</p>}
      {growth.isSuccess &&
        (desktop ? (
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-6">
            {chartSection}
            <div className="flex flex-col gap-4">
              {registered}
              {list}
            </div>
          </div>
        ) : (
          <>
            {chartSection}
            {registered}
            {list}
          </>
        ))}
      {planOpen && <FreemiumLimitModal reason="growth_chart" opener={planRef} onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
      {removing && (
        <ConfirmDialog
          title={GROWTH.removeTitle(formatDateShort(removing.measuredOn))}
          rows={[{ k: '', v: GROWTH.removeBody }]}
          confirmLabel={GROWTH.remove}
          busyLabel={GROWTH.removing}
          tone="ink"
          busy={remove.isPending}
          error={removeError}
          onConfirm={() =>
            remove.mutate(removing.id, {
              onSuccess: () => setRemoving(null),
              onError: () => setRemoveError(GROWTH.removeFailed),
            })
          }
          onCancel={() => setRemoving(null)}
          opener={removeRef}
        />
      )}
    </RoutinePageFrame>
  )
}
