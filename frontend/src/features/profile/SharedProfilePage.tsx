import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { formatWeekdayLong } from '../../shared/date'
import { PageHeader } from '../../shared/ui/PageHeader'
import { useLocalDay } from '../../shared/useLocalDay'
import { subjectKey, type Subject } from '../../shared/subject'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { NextAppointmentCompact } from '../appointments/NextAppointmentCompact'
import { ConsultationsSection, TreatmentCard } from '../childDetail/ChildDetailParts'
import { TodayCardView } from '../childDetail/ChildTodayCard'
import { ConsultationApiError, fetchConsultations } from '../consultations/api'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { usePersonOverview } from './hooks'
import { PROFILE } from './profileText'

/**
 * `/personas/:accountId` (specs/058, research R8): somebody of the family who shares their own consultations with the session — a
 * Tutor or the family's owner. Only their consultations: «Hoy» with the doses of their medications (markable here; a mark somebody
 * else made is never taken back from here), their running treatment, their next appointment and their consultations with the
 * history. Never their supplements or activities, never «Nueva consulta», editing or the PDF: an adult's own record is theirs to
 * change. When they stop sharing (or one of them leaves the family) the server answers 403 and the page says so.
 */
export function SharedProfilePage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const { isDesktop } = useSidebarSession()
  const variant = isDesktop ? 'desktop' : 'phone'
  const day = useLocalDay()
  const { getToken } = useAuth()
  const accountQuery = useCurrentAccount()
  const person = accountQuery.data?.sharedProfiles?.find((p) => p.accountId === accountId)
  const subject: Subject = { kind: 'person', accountId }
  const known = accountQuery.isSuccess && person !== undefined
  const overview = usePersonOverview(accountId, day, known)
  const consultations = useQuery({
    queryKey: ['consultations', subjectKey(subject)],
    queryFn: async () => fetchConsultations(subject, await getToken()),
    enabled: known,
    retry: false,
  })

  // Only the server's refusal means they stopped sharing; any other failure is a retry of «Hoy».
  const refused = overview.error instanceof ConsultationApiError && overview.error.kind === 'child_not_found'
  const gone = (accountQuery.isSuccess && person === undefined) || refused
  const header = (
    <PageHeader
      variant={variant}
      back={{ label: PROFILE.backHome, to: '/home' }}
      title={person?.firstName}
      subtitle={
        person && (
          <>
            {formatWeekdayLong(day.from)}
            {isDesktop ? ' · ' : <br />}
            <strong className={`font-bold text-muted ${isDesktop ? '' : 'text-[14px]'}`}>{PROFILE.sharedSubtitle}</strong>
          </>
        )
      }
      state={person ? 'ready' : accountQuery.isPending ? 'loading' : accountQuery.isError ? 'error' : 'ready'}
      errorWhat={PROFILE.loadFailed}
      onRetry={() => void accountQuery.refetch()}
    />
  )
  const frame = (content: ReactNode) => (
    <AppShell>
      {isDesktop ? (
        <main className="min-w-0 bg-canvas px-6 pt-7 pb-14 leading-[normal] lg:px-12">
          <div className="mx-auto flex max-w-[904px] flex-col gap-6">{content}</div>
        </main>
      ) : (
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10 leading-[normal]">{content}</main>
      )}
    </AppShell>
  )

  if (gone)
    return frame(
      <div className={`flex flex-col items-start gap-3 ${isDesktop ? '' : 'px-5 pt-6'}`}>
        <p role="alert" className="text-[18px] font-extrabold text-ink">
          {PROFILE.sharedGone}
        </p>
        <p className="text-[15px] leading-normal text-body">{PROFILE.sharedGoneText}</p>
        <Link to="/home" className="inline-flex min-h-11 items-center rounded-2xl border-2 border-action px-5 text-[15px] font-extrabold text-action hover:bg-hint">
          {PROFILE.backHome}
        </Link>
      </div>,
    )

  const treatment = overview.data?.activeTreatment ?? null
  const today = (
    <TodayCardView
      variant={variant}
      pending={overview.data === undefined && !overview.isError}
      failed={overview.isError && !overview.data ? { text: PROFILE.loadFailedDay, onRetry: () => void overview.refetch() } : null}
      doses={overview.data?.doses ?? []}
      activities={[]}
      toMark={(overview.data?.doses ?? []).filter((d) => !d.taken && d.status === 'due').length}
      canManage={false}
    />
  )
  const list = person && (
    <ConsultationsSection
      consultations={consultations.data ?? []}
      status={consultations.data !== undefined ? 'ready' : consultations.isError ? 'error' : 'loading'}
      childId={subject}
      historyTo={`/personas/${accountId}/historial`}
      child={null}
      free={false}
      variant={variant}
      onRetry={() => void consultations.refetch()}
    />
  )
  const appointment = person && <NextAppointmentCompact childId={subject} variant={variant} />

  if (isDesktop)
    return frame(
      <>
        {header}
        {person && today}
        <div className="grid grid-cols-[minmax(0,1fr)_296px] items-start gap-7">
          <div className="flex min-w-0 flex-col gap-6">{list}</div>
          <aside className="sticky top-6 flex flex-col gap-4">
            {treatment && <TreatmentCard treatment={treatment} variant="desktop" />}
            {appointment}
          </aside>
        </div>
      </>,
    )
  return frame(
    <>
      {header}
      <div className="flex flex-col gap-5 px-5">
        {person && today}
        {treatment && <TreatmentCard treatment={treatment} variant="phone" />}
        {appointment}
        {list}
      </div>
    </>,
  )
}
