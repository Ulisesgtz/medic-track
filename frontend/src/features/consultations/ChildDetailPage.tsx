import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionIndex } from '../../shared/ui/SectionIndex'
import { StickyActionBar } from '../../shared/ui/StickyActionBar'
import { useLocalDay } from '../../shared/useLocalDay'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { ChildAppointmentSection } from '../appointments/AppointmentSections'
import { ChildTodayCard } from '../childDetail/ChildTodayCard'
import { CartillaSection, ConsultationsSection, DaySummaryCard, MoreRows, TreatmentCard } from '../childDetail/ChildDetailParts'
import { CHILD, childSubtitle } from '../childDetail/childDetailText'
import { RegistroCompacto } from '../supplements/RegistroCompacto'
import { fetchChildOverview, fetchConsultations, ConsultationApiError } from './api'
import { NewConsultationEntry } from './NewConsultationEntry'
import { DOSE_REFETCH_MS } from './doseStatus'

const SECTIONS = [
  { id: 'consultas', label: CHILD.consultations },
  { id: 'suplementos', label: CHILD.supplements },
  { id: 'actividades', label: CHILD.activities },
  { id: 'cartilla', label: CHILD.cartilla },
]

/**
 * A child's detail (specs/056, design «Detalle y Mi día PediTrack.dc.html», screen A; deviations in
 * `specs/056-rediseno-detalles/referencia/desviaciones.md`). Today first: the common header (avatar, name, age), «Hoy» with every
 * dose of the day markable here, the active treatment and the next appointment, then the index of sections — Consultas,
 * Suplementos, Actividades, Cartilla — and «Lo demás». «Nueva consulta» is the one solid button: pinned at the bottom on the phone,
 * at the header's right on the web; never for a Caregiver or a read-only Tutor. The web has two columns: the sections, and the
 * treatment, appointment and day summary at the right.
 */
export function ChildDetailPage() {
  const { childId = '' } = useParams<{ childId: string }>()
  const { isDesktop } = useSidebarSession()
  const accountQuery = useCurrentAccount()
  const children = accountQuery.data?.children ?? []
  const index = children.findIndex((c) => c.id === childId)
  const child = index >= 0 ? children[index] : undefined
  // Specs/032: what the session can do with THIS child — the plan is its family's, and a Caregiver can't add.
  const access = useChildAccess(accountQuery.data, childId)

  const today = useLocalDay()
  const { getToken } = useAuth()
  const overviewQuery = useQuery({
    queryKey: ['overview', childId, today.from.toISOString()],
    queryFn: async () => fetchChildOverview(childId, today.from, today.to, await getToken()),
    enabled: !!childId,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  })
  const query = useQuery({
    queryKey: ['consultations', childId],
    queryFn: async () => fetchConsultations(childId, await getToken()),
    enabled: !!childId,
    retry: false,
  })

  if (query.isError && query.error instanceof ConsultationApiError && query.error.kind === 'child_not_found') {
    return (
      <AppShell activeChildId={childId}>
        <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
          <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
            <p className="text-lg font-bold tracking-tight text-ink">{CHILD.notFound}</p>
            <Link to="/home" className="mt-6 inline-flex min-h-11 items-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint">
              {CHILD.backHome}
            </Link>
          </div>
        </main>
      </AppShell>
    )
  }

  const variant = isDesktop ? 'desktop' : 'phone'
  const childName = child?.firstName ?? 'tu hijo'
  const treatment = overviewQuery.data?.activeTreatment ?? null
  // specs/030: on the free plan a treatment still running means the next consultation has to wait, so the pop-up opens right away.
  const blocked = access.isFree && treatment !== null
  const consultations = query.data ?? []
  const listStatus = query.isPending ? 'loading' : query.isError ? 'error' : 'ready'

  const avatar = child && (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-black text-white ${index % 2 ? 'bg-confirmed' : 'bg-action'} ${isDesktop ? 'h-[60px] w-[60px] text-[24px]' : 'h-[52px] w-[52px] text-[21px]'}`}
    >
      {child.firstName.charAt(0)}
    </span>
  )
  const newConsultation = access.canAdd && (
    <NewConsultationEntry
      to={`/children/${childId}/consultations/new`}
      blocked={blocked}
      className={`min-h-[52px] cursor-pointer rounded-2xl bg-confirmed text-[17px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 ${isDesktop ? 'shrink-0 px-7' : 'flex w-full items-center justify-center'}`}
    >
      {CHILD.newConsultation}
    </NewConsultationEntry>
  )
  const header = (
    <PageHeader
      variant={variant}
      back={{ label: CHILD.backHome, to: '/home' }}
      avatar={avatar}
      title={child?.firstName}
      subtitle={child ? childSubtitle(child.birthDate) : undefined}
      actions={isDesktop ? newConsultation || undefined : undefined}
      readOnly={access.readOnly}
      state={child ? 'ready' : 'loading'}
    />
  )
  const sections = (
    <>
      <SectionIndex sections={SECTIONS} variant={variant} />
      <ConsultationsSection
        consultations={consultations}
        status={listStatus}
        childId={childId}
        child={child}
        free={access.isFree}
        variant={variant}
      />
      <RegistroCompacto kind="supplement" childId={childId} sectionId="suplementos" variant={variant} />
      <RegistroCompacto kind="activity" childId={childId} sectionId="actividades" variant={variant} />
      <CartillaSection childId={childId} canAdd={access.canAdd} variant={variant} />
    </>
  )
  const appointment = <ChildAppointmentSection childId={childId} historyPath={`/children/${childId}/citas`} />
  const more = <MoreRows childId={childId} childName={childName} canAdd={access.canAdd} free={access.isFree} variant={variant} />

  if (isDesktop) {
    return (
      <AppShell activeChildId={childId}>
        <main className="min-w-0 bg-canvas px-6 pt-7 pb-14 leading-[normal] lg:px-12">
          <div className="mx-auto flex max-w-[904px] flex-col gap-6">
            {header}
            <ChildTodayCard childId={childId} childName={childName} variant="desktop" />
            <div className="grid grid-cols-[minmax(0,1fr)_296px] items-start gap-7">
              <div className="flex min-w-0 flex-col gap-6">{sections}</div>
              <aside className="sticky top-6 flex flex-col gap-4">
                {treatment && <TreatmentCard treatment={treatment} variant="desktop" />}
                {appointment}
                <DaySummaryCard childId={childId} />
              </aside>
            </div>
            {more}
          </div>
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell activeChildId={childId}>
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas">
        {header}
        <div className="flex flex-col gap-5 px-5 leading-[normal]">
          <ChildTodayCard childId={childId} childName={childName} variant="phone" />
          {treatment && <TreatmentCard treatment={treatment} variant="phone" />}
          {appointment}
          {sections}
          {more}
          {newConsultation ? <StickyActionBar variant="phone">{newConsultation}</StickyActionBar> : <div className="h-6" />}
        </div>
      </main>
    </AppShell>
  )
}
