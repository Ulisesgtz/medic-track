import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatTime, formatWeekdayLong } from '../../shared/date'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionIndex } from '../../shared/ui/SectionIndex'
import { useLocalDay } from '../../shared/useLocalDay'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { CHILD, activitiesDone, nameAtTime, summaryDoses } from '../childDetail/childDetailText'
import { DaySummaryView } from '../childDetail/ChildDetailParts'
import { TodayCardView } from '../childDetail/ChildTodayCard'
import type { OverviewDose } from '../consultations/types'
import { AppShell } from '../home/AppShell'
import { HOME } from '../home/homeText'
import { useSidebarSession } from '../home/useSidebarSession'
import { PlanAvisoCompacto } from '../plans/PlanAvisoCompacto'
import { useAcknowledgePersonalNotice, usePersonalRoutines } from './hooks'
import { MY_DAY, initials } from './myDayText'
import { RegistroCompacto } from './RegistroCompacto'
import type { Routine } from './types'

const SECTIONS = [
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
 * `/mi-dia` (specs/056, design «Detalle y Mi día PediTrack.dc.html», screen B; research R8): the person's own page, joining «Mis
 * suplementos» and «Mis actividades». «Hoy» first — their doses by Mañana / Tarde / Noche and their activities, marked here — then the
 * index Suplementos · Actividades and both lists. With nothing created, «Hoy» carries the first steps: one solid button («Agregar mi
 * primer suplemento») and the activity with outline, and no empty sections. Nobody else sees any of it (specs/033 part 3).
 */
export function MyDayPage() {
  const { isDesktop } = useSidebarSession()
  const variant = isDesktop ? 'desktop' : 'phone'
  const day = useLocalDay()
  const { hash } = useLocation()
  const account = useCurrentAccount().data
  const supplements = usePersonalRoutines(account?.id, 'supplement', day)
  const activities = usePersonalRoutines(account?.id, 'activity', day)

  const ready = supplements.isSuccess && activities.isSuccess
  const sups = supplements.data?.routines ?? []
  const acts = activities.data?.routines ?? []
  const nothing = ready && sups.length === 0 && acts.length === 0
  const paid = supplements.data?.paidPlan === true

  // `/mis-suplementos` and `/mis-actividades` land here with their section's hash: bring it into view once it is drawn.
  useEffect(() => {
    if (!ready || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' })
  }, [ready, hash])

  const doses = asDoses(sups)
  const activeActivities = acts.filter((r) => r.status === 'active' && r.doses.length > 0)
  const activityDoses = activeActivities.flatMap((r) => r.doses)
  const toMark = [...doses, ...activityDoses].filter((d) => !d.taken && d.status === 'due').length

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
            className={`inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-confirmed px-[26px] text-[17px] font-extrabold text-white hover:bg-emerald-800 ${isDesktop ? 'shrink-0' : 'order-1'}`}
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
      failed={supplements.isError || activities.isError ? { text: HOME.loadFailedMine, onRetry: () => void Promise.all([supplements.refetch(), activities.refetch()]) } : null}
      doses={doses}
      activities={activeActivities}
      toMark={toMark}
      empty={nothing ? firstSteps : undefined}
    />
  )
  // Open the first time — also with nothing created, under «Hoy» (design B3); after «Entendido», a link.
  const how = ready && account && <HowItWorks seen={supplements.data!.noticeSeen} accountId={account.id} desktop={isDesktop} />
  const sections = ready && !nothing && (
    <>
      <SectionIndex sections={SECTIONS} variant={variant} />
      {how}
      <RegistroCompacto kind="supplement" personal sectionId="suplementos" variant={variant} />
      <RegistroCompacto kind="activity" personal sectionId="actividades" variant={variant} />
    </>
  )

  const next = doses.filter((d) => d.status === 'pending' || d.status === 'due').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
  const summary = [
    { t: CHILD.summaryDoses, v: doses.length ? summaryDoses(doses.length, doses.filter((d) => !d.taken && d.status === 'due').length, doses.filter((d) => d.taken).length) : CHILD.noneToday },
    ...(next ? [{ t: CHILD.summaryNext, v: nameAtTime(next.medicationName, formatTime(next.scheduledAt)) }] : []),
    { t: CHILD.activities, v: activityDoses.length ? activitiesDone(activityDoses.filter((d) => d.taken).length, activityDoses.length) : CHILD.noneToday },
  ]

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
      title={MY_DAY.title}
      subtitle={
        <>
          {formatWeekdayLong(day.from)}
          {isDesktop ? ' · ' : <br />}
          <strong className={`font-bold text-muted ${isDesktop ? '' : 'text-[14px]'}`}>{MY_DAY.onlyYou}</strong>
        </>
      }
    />
  )

  return (
    <AppShell>
      {isDesktop ? (
        <main className="min-w-0 bg-canvas px-6 pt-7 pb-14 leading-[normal] lg:px-12">
          <div className="mx-auto flex max-w-[904px] flex-col gap-6">
            {header}
            {today}
            {nothing && how}
            {sections && (
              <div className="grid grid-cols-[minmax(0,1fr)_296px] items-start gap-7">
                <div className="flex min-w-0 flex-col gap-6">{sections}</div>
                <aside className="sticky top-6 flex flex-col gap-4">
                  <DaySummaryView rows={summary} />
                </aside>
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
          {header}
          <div className="flex flex-col gap-5 px-5 leading-[normal]">
            {today}
            {nothing && how}
            {sections}
          </div>
        </main>
      )}
    </AppShell>
  )
}
