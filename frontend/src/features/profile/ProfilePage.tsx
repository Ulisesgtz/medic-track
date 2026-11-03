import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { formatTime, formatWeekdayLong } from '../../shared/date'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionIndex } from '../../shared/ui/SectionIndex'
import { StickyActionBar } from '../../shared/ui/StickyActionBar'
import { useLocalDay } from '../../shared/useLocalDay'
import { subjectAccessOf, subjectKey, type Subject } from '../../shared/subject'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { NextAppointmentCompact } from '../appointments/NextAppointmentCompact'
import { CHILD, activitiesDone, nameAtTime, summaryDoses } from '../childDetail/childDetailText'
import { ConsultationsSection, DaySummaryView, TreatmentCard } from '../childDetail/ChildDetailParts'
import { TodayCardView } from '../childDetail/ChildTodayCard'
import { fetchConsultations } from '../consultations/api'
import { NewConsultationEntry } from '../consultations/NewConsultationEntry'
import type { OverviewDose } from '../consultations/types'
import { AppShell } from '../home/AppShell'
import { HOME } from '../home/homeText'
import { useSidebarSession } from '../home/useSidebarSession'
import { PlanAvisoCompacto } from '../plans/PlanAvisoCompacto'
import { useAcknowledgePersonalNotice, usePersonalRoutines } from '../supplements/hooks'
import { MY_DAY, initials } from '../supplements/myDayText'
import { RegistroCompacto } from '../supplements/RegistroCompacto'
import type { Routine } from '../supplements/types'
import { usePersonOverview } from './hooks'
import { PROFILE } from './profileText'
import { SharingCard } from './SharingCards'

const SECTIONS = [
  { id: 'consultas', label: CHILD.consultations },
  { id: 'suplementos', label: CHILD.supplements },
  { id: 'actividades', label: CHILD.activities },
]

/** A supplement's doses as the doses «Hoy» marks (the same toggle as a child's supplement: by its routine). */
function asDoses(routines: Routine[]): OverviewDose[] {
  return routines
    .filter((r) => r.kind === 'supplement' && r.status === 'active')
    .flatMap((r) =>
      r.doses.map((d) => ({
        id: d.id,
        kind: 'supplement' as const,
        routineId: r.id,
        consultationId: '',
        medicationName: r.name,
        scheduledAt: d.scheduledAt,
        taken: d.taken,
        status: d.status,
        takenBy: d.takenBy ?? null,
      })),
    )
}

/**
 * «Cómo funcionan» (design B): open the first time, kept per account by the server; after «Entendido» it stays as a link that opens it
 * again. It only says what the app does: it records what the person writes (Principio I).
 */
function HowItWorks({ seen, accountId, desktop }: { seen: boolean; accountId: string; desktop: boolean }) {
  const acknowledge = useAcknowledgePersonalNotice(accountId)
  const [reopened, setReopened] = useState(false)
  const [failed, setFailed] = useState(false)
  if (seen && !reopened)
    return (
      <button type="button" onClick={() => setReopened(true)} className="-my-2 inline-flex min-h-11 cursor-pointer items-center self-start text-[15px] font-bold text-action">
        {MY_DAY.howTitle}
      </button>
    )
  const understood = () => {
    setFailed(false)
    if (seen) return setReopened(false)
    acknowledge.mutate(undefined, { onError: () => setFailed(true) })
  }
  return (
    <div role="note" className={`flex rounded-[22px] border-[1.5px] border-hint-border bg-hint ${desktop ? 'items-center gap-5 px-[22px] py-[18px]' : 'flex-col gap-2 px-[18px] py-4'}`}>
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-[17px] font-extrabold text-ink">{MY_DAY.howTitle}</p>
        <p className="text-[15px] leading-[1.55] text-body">{MY_DAY.howText}</p>
        {failed && (
          <p role="alert" className="text-[14px] text-body">
            {MY_DAY.saveFailed}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={acknowledge.isPending}
        onClick={understood}
        className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-2xl border-2 border-action px-5 text-[15px] font-extrabold text-action hover:bg-surface disabled:opacity-60 ${desktop ? '' : 'mt-1 self-start'}`}
      >
        {MY_DAY.understood}
      </button>
    </div>
  )
}

/**
 * `/yo` (specs/058-consultas-del-titular, research R8): the person's own profile — what «Mi día» was (specs/056, screen B) plus their
 * own consultations, laid out like a child's detail. «Hoy» first — the doses of their medications and supplements by Mañana /
 * Tarde / Noche and their activities, marked here — then their running treatment and next appointment, the index Consultas ·
 * Suplementos · Actividades and the three lists. «Nueva consulta» is the one solid button (pinned at the bottom on the phone, at the
 * header's right on the web); on the free plan it opens the plan notice. With a family, the switch to share their consultations
 * with its Tutors; supplements and activities stay the person's alone (specs/033 part 3).
 */
export function ProfilePage() {
  const { isDesktop } = useSidebarSession()
  const variant = isDesktop ? 'desktop' : 'phone'
  const day = useLocalDay()
  const { hash } = useLocation()
  const { getToken } = useAuth()
  const account = useCurrentAccount().data
  const me: Subject | undefined = account ? { kind: 'person', accountId: account.id } : undefined
  const access = subjectAccessOf(account, me)
  const supplements = usePersonalRoutines(account?.id, 'supplement', day)
  const activities = usePersonalRoutines(account?.id, 'activity', day)
  const overview = usePersonOverview(account?.id, day)
  const consultationsQuery = useQuery({
    queryKey: ['consultations', me ? subjectKey(me) : undefined],
    queryFn: async () => fetchConsultations(me!, await getToken()),
    enabled: !!me,
    retry: false,
  })

  const ready = supplements.isSuccess && activities.isSuccess && overview.isSuccess
  const sups = supplements.data?.routines ?? []
  const acts = activities.data?.routines ?? []
  const noRoutines = supplements.isSuccess && activities.isSuccess && sups.length === 0 && acts.length === 0
  const paid = supplements.data?.paidPlan === true

  // `/mis-suplementos`, `/mis-actividades` and the old `/mi-dia` land here with a section's hash: bring it into view once drawn.
  useEffect(() => {
    if (!ready || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' })
  }, [ready, hash])

  const medicationDoses = overview.data?.doses ?? []
  const doses = [...medicationDoses, ...asDoses(sups)]
  const activeActivities = acts.filter((r) => r.status === 'active' && r.doses.length > 0)
  const activityDoses = activeActivities.flatMap((r) => r.doses)
  const toMark = [...doses, ...activityDoses].filter((d) => !d.taken && d.status === 'due').length
  const treatment = overview.data?.activeTreatment ?? null

  const firstSteps = (
    <div className={`flex gap-2.5 ${isDesktop ? 'flex-wrap items-center gap-4' : 'flex-col pt-1'}`}>
      <p className={`text-[15px] leading-[1.55] text-body ${isDesktop ? 'flex-[1_1_280px]' : ''}`}>{MY_DAY.firstText}</p>
      {paid ? (
        <>
          <Link
            to="/mis-actividades/nueva"
            className={`inline-flex min-h-11 items-center justify-center rounded-[14px] border-2 border-action px-5 text-[15px] font-extrabold text-action hover:bg-hint ${isDesktop ? 'shrink-0' : 'order-2'}`}
          >
            {MY_DAY.firstActivity}
          </Link>
          <Link
            to="/mis-suplementos/nueva"
            className={`inline-flex min-h-11 items-center justify-center rounded-[14px] border-2 border-action px-5 text-[15px] font-extrabold text-action hover:bg-hint ${isDesktop ? 'shrink-0' : 'order-1'}`}
          >
            {MY_DAY.firstSupplement}
          </Link>
        </>
      ) : (
        <PlanAvisoCompacto title={MY_DAY.planTitle} text={MY_DAY.planText} />
      )}
    </div>
  )

  const today = (
    <TodayCardView
      variant={variant}
      pending={!ready}
      failed={
        supplements.isError || activities.isError || overview.isError
          ? { text: HOME.loadFailedMine, onRetry: () => void Promise.all([supplements.refetch(), activities.refetch(), overview.refetch()]) }
          : null
      }
      doses={doses}
      activities={activeActivities}
      toMark={toMark}
      canManage
      empty={noRoutines && medicationDoses.length === 0 ? firstSteps : undefined}
    />
  )
  // Open the first time; after «Entendido», a link.
  const how = ready && account && <HowItWorks seen={supplements.data!.noticeSeen} accountId={account.id} desktop={isDesktop} />
  const consultations = account && me && (
    <ConsultationsSection
      consultations={consultationsQuery.data ?? []}
      status={consultationsQuery.isPending ? 'loading' : consultationsQuery.isError ? 'error' : 'ready'}
      childId={me}
      historyTo="/yo/historial"
      child={account}
      free={access.isFree}
      variant={variant}
      onRetry={() => void consultationsQuery.refetch()}
      emptyText={PROFILE.noConsultationsText}
    />
  )
  const sections = ready && (
    <>
      <SectionIndex sections={SECTIONS} variant={variant} />
      {consultations}
      {how}
      <RegistroCompacto kind="supplement" personal sectionId="suplementos" variant={variant} />
      <RegistroCompacto kind="activity" personal sectionId="actividades" variant={variant} />
    </>
  )
  // Only with a family there is somebody to share with (specs/058, research R5).
  const sharing = account?.family !== undefined || (account?.consultationSharing?.shared ?? false)
  const sharingCard = account && sharing && <SharingCard accountId={account.id} shared={account.consultationSharing?.shared ?? false} />
  const appointment = me && <NextAppointmentCompact childId={me} variant={variant} />

  const next = doses.filter((d) => d.status === 'pending' || d.status === 'due').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
  const summary = [
    { t: CHILD.summaryDoses, v: doses.length ? summaryDoses(doses.length, doses.filter((d) => !d.taken && d.status === 'due').length, doses.filter((d) => d.taken).length) : CHILD.noneToday },
    ...(next ? [{ t: CHILD.summaryNext, v: nameAtTime(next.medicationName, formatTime(next.scheduledAt)) }] : []),
    { t: CHILD.activities, v: activityDoses.length ? activitiesDone(activityDoses.filter((d) => d.taken).length, activityDoses.length) : CHILD.noneToday },
  ]

  const newConsultation = account && (
    <NewConsultationEntry
      to="/yo/consultas/nueva"
      blocked={access.isFree}
      reason="own_consultations"
      className={`min-h-[52px] cursor-pointer rounded-2xl bg-confirmed text-[17px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 ${isDesktop ? 'shrink-0 px-7' : 'flex w-full items-center justify-center'}`}
    >
      {PROFILE.newConsultation}
    </NewConsultationEntry>
  )
  const header = (
    <PageHeader
      variant={variant}
      back={{ label: CHILD.backHome, to: '/home' }}
      avatar={
        account && (
          <span
            aria-hidden="true"
            className={`flex shrink-0 items-center justify-center rounded-full bg-ink font-black text-white ${isDesktop ? 'h-[60px] w-[60px] text-[19px]' : 'h-[52px] w-[52px] text-[17px]'}`}
          >
            {initials(account.firstName, account.lastName)}
          </span>
        )
      }
      title={account?.firstName ?? MY_DAY.title}
      subtitle={
        <>
          {formatWeekdayLong(day.from)}
          {isDesktop ? ' · ' : <br />}
          <strong className={`font-bold text-muted ${isDesktop ? '' : 'text-[14px]'}`}>
            {account?.consultationSharing?.shared ? PROFILE.sharedWithTutors : PROFILE.onlyYou}
          </strong>
        </>
      }
      actions={isDesktop ? newConsultation || undefined : undefined}
    />
  )

  return (
    <AppShell>
      {isDesktop ? (
        <main className="min-w-0 bg-canvas px-6 pt-7 pb-14 leading-[normal] lg:px-12">
          <div className="mx-auto flex max-w-[904px] flex-col gap-6">
            {header}
            {today}
            {sections && (
              <div className="grid grid-cols-[minmax(0,1fr)_296px] items-start gap-7">
                <div className="flex min-w-0 flex-col gap-6">{sections}</div>
                <aside className="sticky top-6 flex flex-col gap-4">
                  {treatment && <TreatmentCard treatment={treatment} variant="desktop" />}
                  {appointment}
                  <DaySummaryView rows={summary} />
                  {sharingCard}
                </aside>
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas">
          {header}
          <div className="flex flex-col gap-5 px-5 leading-[normal]">
            {today}
            {treatment && <TreatmentCard treatment={treatment} variant="phone" />}
            {appointment}
            {sections}
            {sharingCard}
            {newConsultation ? <StickyActionBar variant="phone">{newConsultation}</StickyActionBar> : <div className="h-6" />}
          </div>
        </main>
      )}
    </AppShell>
  )
}
