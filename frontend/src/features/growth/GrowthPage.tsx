import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { formatAgeLong } from '../../shared/age'
import { formatDateShortNoPad } from '../../shared/date'
import { useLocalDay } from '../../shared/useLocalDay'
import { dayKeyOf } from '../consultations/treatmentDays'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { GrowthApiError } from './api'
import { ChartCard } from './ChartCard'
import { ChartLockedCard, EmptyCard, LatestCard, ReadOnlyNote, RegisteredBox, WhoNote, growthCard } from './GrowthCards'
import { MeasurementsList, MeasurementsTable } from './Measurements'
import { GROWTH } from './growthText'
import { useDeleteMeasurement, useGrowth, useGrowthChart, useSetReferenceSex } from './hooks'
import type { Measurement } from './types'


/**
 * `/children/:childId/crecimiento`, rebuilt from Claude Design's mock (specs/065-rediseno-crecimiento/referencia): the newest
 * measurement in large, the signup's values apart, the chart (Peso / Talla, a short age range, the reading with ‹ ›) and
 * «Medidas anotadas». Two designs by `useIsDesktop`, never mixed. The free plan sees everything but the chart, which is never asked
 * (the server decides). Who can't write sees no write control. Nothing evaluates the child (Principio I).
 */
export function GrowthPage() {
  const { childId = '' } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { isDesktop: desktop } = useSidebarSession()
  const variant = desktop ? 'desktop' : 'phone'
  const local = useLocalDay().from
  const today = dayKeyOf(local.getFullYear(), local.getMonth(), local.getDate())
  const accountQuery = useCurrentAccount()
  const account = accountQuery.data
  const child = account?.children.find((c) => c.id === childId)
  const name = child?.firstName ?? ''
  const growth = useGrowth(childId)
  const data = growth.data
  const canEdit = data?.canEdit ?? false
  const measurements = data?.measurements ?? []
  const hasMeasurements = measurements.length > 0
  const chartAvailable = data?.chartAvailable ?? false
  const chart = useGrowthChart(childId, chartAvailable && hasMeasurements)
  const setSex = useSetReferenceSex(childId)
  const remove = useDeleteMeasurement(childId)
  const [removing, setRemoving] = useState<Measurement | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const removeRef = useRef<HTMLButtonElement>(null)

  const planBlocked = !chartAvailable || (chart.error instanceof GrowthApiError && chart.error.kind === 'plan_required')
  const ownerName = account?.family?.ownerName ?? (child?.role === 'owner' || child?.role === undefined ? (account?.firstName ?? null) : null)
  const caregiver = child?.role === 'caregiver'

  const addLink =
    canEdit && hasMeasurements ? (
      <Link to={`/children/${childId}/crecimiento/nueva`} className={`${pageHeaderButton('primary', variant, { tall: true })} ${desktop ? '' : 'w-full'}`}>
        {GROWTH.addPlus}
      </Link>
    ) : undefined

  const onRemove = (m: Measurement, opener: HTMLButtonElement) => {
    removeRef.current = opener
    setRemoveError(null)
    setRemoving(m)
  }

  const latest = hasMeasurements ? <LatestCard measurement={measurements[0]} today={today} desktop={desktop} /> : null
  const empty = !hasMeasurements ? <EmptyCard childId={childId} canEdit={canEdit} desktop={desktop} /> : null
  const registered = data?.registered ? (
    <RegisteredBox registered={data.registered} childName={name} childId={childId} canEdit={canEdit} desktop={desktop} />
  ) : null

  const chartBlock = !hasMeasurements ? null : planBlocked ? (
    <ChartLockedCard childName={name} desktop={desktop} onViewPlans={() => navigate('/planes')} />
  ) : chart.isPending ? (
    <section aria-label={GROWTH.chartLoading} aria-busy="true" className={`${growthCard} ${desktop ? 'p-6' : 'p-4'}`}>
      <div className={`w-full rounded-xl bg-skel ${desktop ? 'aspect-[854/380]' : 'aspect-[316/264]'}`} />
    </section>
  ) : chart.isError ? (
    <section aria-label={GROWTH.chartSection} className={`${growthCard} flex flex-col items-start gap-2 ${desktop ? 'p-6' : 'p-4'}`}>
      <p className="text-[15px] text-body">{GROWTH.chartFailed}</p>
      <button type="button" onClick={() => void chart.refetch()} className="min-h-11 cursor-pointer text-[15px] font-extrabold text-action hover:underline">
        {GROWTH.retry}
      </button>
    </section>
  ) : (
    <ChartCard
      chart={chart.data}
      childName={name}
      today={today}
      canEdit={canEdit}
      ownerName={ownerName}
      desktop={desktop}
      onChooseSex={(sex) => setSex.mutate(sex)}
      choosingSex={setSex.isPending}
      chooseFailed={setSex.isError}
    />
  )
  // The fixed note goes inside the chart's card; without the chart (empty or free plan) it stands alone.
  const noteOutside = !hasMeasurements || planBlocked ? <WhoNote desktop={desktop} /> : null

  const listProps = { measurements, birthDate: data?.birthDate ?? '', childId, canEdit, onRemove }
  const list = hasMeasurements ? desktop ? <MeasurementsTable {...listProps} /> : <MeasurementsList {...listProps} /> : null

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={childId}
      backLabel={child ? GROWTH.backChild(child.firstName) : '← Inicio'}
      backTo={child ? `/children/${childId}` : '/home'}
      title={GROWTH.title}
      subtitle={child ? `${child.firstName} · ${formatAgeLong(child.birthDate)}` : GROWTH.subtitle}
      actions={growth.isSuccess ? addLink : undefined}
      state={growth.isError ? 'error' : growth.isPending ? 'loading' : undefined}
      errorWhat={GROWTH.loadFailed}
      onRetry={() => void growth.refetch()}
      phoneContent="gap-4"
    >
      {growth.isSuccess &&
        (desktop ? (
          <>
            {!canEdit && <ReadOnlyNote caregiver={caregiver} desktop />}
            {latest || empty || registered ? (
              <div className={registered ? 'grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-stretch gap-5' : ''}>
                {latest ?? empty}
                {registered}
              </div>
            ) : null}
            {chartBlock}
            {noteOutside}
            {list}
          </>
        ) : (
          <>
            {!canEdit && <ReadOnlyNote caregiver={caregiver} desktop={false} />}
            {latest}
            {empty}
            {chartBlock}
            {noteOutside}
            {list}
            {registered}
          </>
        ))}
      {removing && (
        <ConfirmDialog
          title={GROWTH.removeTitle(formatDateShortNoPad(removing.measuredOn))}
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
