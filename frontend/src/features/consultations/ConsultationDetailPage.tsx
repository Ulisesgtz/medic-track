import { useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/react'
import { useLocation, useParams, Link } from 'react-router-dom'
import { useShownQuery } from '../../shared/marks/usePendingMarks'
import { useQuery } from '@tanstack/react-query'
import { formatDateShort } from '../../shared/date'
import { PageHeader } from '../../shared/ui/PageHeader'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { useLocalDay } from '../../shared/useLocalDay'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { cabinetAccess } from '../medicineCabinet/cabinetAccess'
import { OwnRemindersCard } from '../profile/SharingCards'
import { PROFILE, backTo } from '../profile/profileText'
import { newConsultationHref, subjectAccessOf, subjectHref, subjectKey, subjectOfConsultation } from '../../shared/subject'
import { NewConsultationEntry } from './NewConsultationEntry'
import { fetchChildOverview, fetchConsultationDetail, ConsultationApiError } from './api'
import { sniffImageMimeType } from './imageMime'
import { MedicationCard } from './MedicationCard'
import { Notice } from '../../shared/ui/Notice'
import { ConsultationAppointmentSection } from '../appointments/AppointmentSections'
import { PhotoViewer } from './PhotoViewer'
import { SymptomChips } from './SymptomChips'
import { CalendarLegendCard } from './CalendarLegendCard'
import { TreatmentCalendar } from './TreatmentCalendar'
import { dayKey, dosesOfDay, firstDoseDay, initialDay, longDay, numbered, shortDay, treatmentSpan } from './treatmentDays'
import { DOSE_REFETCH_MS } from './doseStatus'
import { EDIT_TEXT, editedLine } from './editText'
import { DETAIL, dataSummary, dayTitle, finished, inProgress, toMarkChip, unregisteredChip } from './consultationDetailText'
import type { ConsultationDetail } from './types'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const chip = 'rounded-full text-[13px] font-extrabold'

/** A receipt: the sheet of the design's thumbnail. */
function ReceiptIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" className="stroke-action" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </svg>
  )
}

/**
 * «Datos de la consulta» (design C): folded on the phone with its summary («Foto · 3 síntomas · notas»), open on the web, and open
 * from the start for a «solo registro» consultation. The photo opens in the viewer inside the app.
 */
function ConsultationData({
  consultation,
  desktop,
  onPhoto,
}: {
  consultation: ConsultationDetail
  desktop: boolean
  onPhoto: () => void
}) {
  const [open, setOpen] = useState(desktop || consultation.recordOnly === true)
  const hasPhoto = consultation.photoBase64 !== ''
  const hasNotes = consultation.notes.trim() !== ''
  return (
    <section aria-label={DETAIL.data} className={`${card} overflow-hidden`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full cursor-pointer items-center gap-3 text-left ${desktop ? 'min-h-14 px-[18px] py-2.5' : 'min-h-[60px] px-4 py-2.5'}`}
      >
        <span className="flex flex-1 flex-col gap-0.5">
          <span className={`font-extrabold text-ink ${desktop ? 'text-[16px]' : 'text-[17px]'}`}>{DETAIL.data}</span>
          {!desktop && <span className="text-[14px] text-body">{dataSummary(hasPhoto, consultation.symptoms.length, hasNotes)}</span>}
        </span>
        <span aria-hidden="true" className={`text-[20px] font-extrabold text-action transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {open && (
        <div className={`flex flex-col gap-4 border-t border-hint-edge pt-1 pb-[18px] ${desktop ? 'px-[18px]' : 'px-4'}`}>
          {hasPhoto ? (
            <div className="flex items-start gap-3.5 pt-3">
              <button
                type="button"
                onClick={onPhoto}
                aria-label={DETAIL.seeReceipt}
                className={`flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-hint-border bg-hint ${desktop ? 'h-[98px] w-[76px]' : 'h-[108px] w-[84px]'}`}
              >
                <ReceiptIcon />
                <span className="text-[11px] font-extrabold text-action">{DETAIL.receipt}</span>
              </button>
              <span className="flex flex-1 flex-col gap-1">
                <button type="button" onClick={onPhoto} className="inline-flex min-h-11 cursor-pointer items-center self-start text-[15px] font-extrabold text-action hover:underline">
                  {DETAIL.seeReceipt}
                </button>
                <span className="text-[13px] leading-normal text-body">{DETAIL.photoNote}</span>
              </span>
            </div>
          ) : (
            <p className="pt-3 text-[15px] text-muted">{DETAIL.noPhoto}</p>
          )}
          {consultation.symptoms.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-bold text-muted">{DETAIL.symptoms}</h3>
              <SymptomChips symptoms={consultation.symptoms} />
            </div>
          )}
          {hasNotes && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[13px] font-bold text-muted">{DETAIL.notes}</h3>
              <p className="text-[15px] leading-[1.55] whitespace-pre-line text-ink">{consultation.notes}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Detail of a single consultation (specs/056, design «Detalle de la consulta PediTrack.dc.html»; deviations in
 * `specs/056-rediseno-detalles/referencia/desviaciones.md`). The treatment first, on both designs: the common header (the date,
 * the doctor, «Editada el … por Ana», «Solo registro», «Editar consulta» with outline), «Tratamiento» with its summary and the
 * chips of the chosen day, the calendar (a week on the phone), «Tomas de …» and a card per medication; then the next appointment
 * and «Datos de la consulta». The web puts the appointment, the data and «Cómo leer el calendario» in a right column and has
 * «Nueva consulta», its only solid button; the phone has none (the frequent action is marking).
 */
export function ConsultationDetailPage() {
  // specs/033, part 2: «Nueva consulta» saved the consultation but not its next appointment.
  const appointmentFailed = (useLocation().state as { appointmentFailed?: boolean } | null)?.appointmentFailed === true
  const { consultationId } = useParams<{ consultationId: string }>()
  const [viewerOpen, setViewerOpen] = useState(false)
  // specs/023: the day the parent tapped in the calendar, with the consultation it was tapped in (this component is reused
  // when the route changes to another consultation); until then, the calendar's own first day (today when it is inside).
  const [picked, setPicked] = useState<{ consultationId: string; day: string } | null>(null)
  const { isDesktop } = useSidebarSession()
  const variant = isDesktop ? 'desktop' : 'phone'

  const { getToken } = useAuth()
  // specs/066: a mark that still travels shows at once (`useShownQuery`).
  const query = useShownQuery(useQuery({
    queryKey: ['consultation', consultationId],
    queryFn: async () => fetchConsultationDetail(consultationId!, await getToken()),
    enabled: !!consultationId,
    retry: false,
    // specs/013: a dose turns "sin registrar" on its own; asking again every minute shows it without reloading.
    refetchInterval: DOSE_REFETCH_MS,
  }))
  // A child's consultation, or a person's own (specs/058: no child; its account is the person's).
  const subject = query.data ? subjectOfConsultation(query.data) : undefined
  const childId = subject?.kind === 'child' ? subject.childId : undefined
  const accountQuery = useCurrentAccount()
  const account = accountQuery.data
  const child = account?.children.find((c) => c.id === childId)
  // Specs/032: the plan is the child's family's, and only who can do everything edits, adds consultations or ends treatments.
  // Specs/058: a person's own consultation, only the person; a Tutor it is shared with sees and marks.
  const access = subjectAccessOf(account, subject)
  const today = useLocalDay()
  // Only the web's «Nueva consulta» needs it (specs/030: the free plan with a treatment running gets the plan notice).
  const overviewQuery = useQuery({
    queryKey: ['overview', subject ? subjectKey(subject) : undefined, today.from.toISOString()],
    queryFn: async () => fetchChildOverview(subject!, today.from, today.to, await getToken()),
    enabled: !!subject && isDesktop && access.canAdd,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  })

  const ownerPath = subject ? subjectHref(subject, account?.id) : '/home'
  const sharedName = subject?.kind === 'person' ? account?.sharedProfiles?.find((p) => p.accountId === subject.accountId)?.firstName : undefined
  const backLabel = child ? `← ${child.firstName}` : subject?.kind === 'person' ? (access.canAdd ? PROFILE.back : sharedName ? backTo(sharedName) : '← Volver') : '← Volver'
  const back = { label: backLabel, to: ownerPath }
  const shell = (content: ReactNode) => (
    <AppShell activeChildId={childId}>
      {isDesktop ? (
        <main className="min-w-0 bg-canvas px-6 pt-7 pb-14 leading-[normal] lg:px-12">
          <div className="mx-auto flex max-w-[904px] flex-col gap-6">{content}</div>
        </main>
      ) : (
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10 leading-[normal]">{content}</main>
      )}
    </AppShell>
  )

  if (query.isPending) return shell(<PageHeader variant={variant} back={back} state="loading" />)
  if (query.isError) {
    const notFound = query.error instanceof ConsultationApiError && query.error.kind === 'consultation_not_found'
    if (notFound) return shell(<PageHeader variant={variant} back={back} title={DETAIL.notFound} />)
    return shell(<PageHeader variant={variant} back={back} state="error" errorWhat={DETAIL.loadFailed} onRetry={() => void query.refetch()} />)
  }

  const consultation = query.data!
  const hasPhoto = consultation.photoBase64 !== ''
  const photoSrc = `data:${sniffImageMimeType(consultation.photoBase64)};base64,${consultation.photoBase64}`
  const treatment = overviewQuery.data?.activeTreatment
  const edited = consultation.edited ? editedLine(consultation.edited) : null
  const recordOnly = consultation.recordOnly

  // specs/019 and 023: one calendar for the whole consultation; the day it chooses is the one every medication card shows.
  const todayKey = dayKey(today.from)
  const meds = numbered(consultation.medications)
  const selectedDay =
    (picked?.consultationId === consultation.id ? picked.day : null) ??
    initialDay(meds, todayKey) ??
    // No calendar day (every dose canceled): the cards still show the first day with doses.
    firstDoseDay(consultation.medications)
  const chooseDay = (day: string) => setPicked({ consultationId: consultation.id, day })

  // «En curso · termina el 4 nov» while a medication still has a dose ahead; «Terminado el 21 oct» once none has.
  const span = treatmentSpan(meds)
  const running = consultation.medications.some((m) => !m.endedAt && m.doses.some((d) => d.status === 'pending' || d.status === 'due'))
  const summary = recordOnly ? DETAIL.recordOnly : span ? (running ? inProgress(shortDay(span.end)) : finished(shortDay(span.end))) : null
  // The chips of the chosen day, across every medication (only the server's `status`; canceled ones left out).
  const dayDoses = selectedDay ? consultation.medications.flatMap((m) => dosesOfDay(m, selectedDay)).filter((d) => d.status !== 'canceled') : []
  const dueCount = dayDoses.filter((d) => !d.taken && d.status === 'due').length
  const unregisteredCount = dayDoses.filter((d) => !d.taken && d.status === 'unregistered').length
  const allMarked = dueCount === 0 && unregisteredCount === 0 && dayDoses.some((d) => d.taken)
  const isToday = selectedDay === todayKey

  const chips = !recordOnly && (
    <>
      {dueCount > 0 && (
        <span className={`${chip} inline-flex items-center gap-1.5 bg-pending-soft px-[11px] py-1 text-on-pending-chip`}>
          <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full border-2 border-pending-dot" />
          {toMarkChip(dueCount)}
        </span>
      )}
      {allMarked && (
        <span className={`${chip} bg-confirmed-soft px-[11px] py-1 text-confirmed-strong`}>{isToday ? DETAIL.allMarkedToday : DETAIL.allMarked}</span>
      )}
      {unregisteredCount > 0 && (
        <span className={`${chip} border-[1.5px] border-dashed border-calendar-muted px-2.5 py-[3px] text-body`}>{unregisteredChip(unregisteredCount)}</span>
      )}
    </>
  )
  const hasCalendar = !recordOnly && span !== null

  const actions = access.canAdd && (
    <>
      <Link to={`/consultations/${consultation.id}/editar`} className={`${pageHeaderButton('edit', variant)} px-[18px]`}>
        {EDIT_TEXT.open}
      </Link>
      {isDesktop && (
        <NewConsultationEntry
          to={subject ? newConsultationHref(subject) : '/home'}
          // specs/030 for a child (a treatment still running); specs/058 for one's own (the paid plan's).
          blocked={access.isFree && (subject?.kind === 'person' || (treatment !== undefined && treatment !== null))}
          className="inline-flex min-h-[52px] cursor-pointer items-center justify-center rounded-2xl bg-confirmed px-6 text-[16px] font-extrabold text-white transition-colors hover:bg-emerald-800"
        >
          {DETAIL.newConsultation}
        </NewConsultationEntry>
      )}
    </>
  )
  const header = (
    <PageHeader
      variant={variant}
      back={back}
      eyebrow={formatDateShort(consultation.consultDate)}
      title={consultation.doctorName}
      subtitle={edited ?? undefined}
      chip={recordOnly ? { label: 'Solo registro', tone: 'line' } : undefined}
      actions={actions || undefined}
      readOnly={access.readOnly}
    />
  )

  const treatmentSection = (
    <section aria-label={DETAIL.treatment} className={`flex min-w-0 flex-col ${isDesktop ? 'gap-3.5' : 'gap-3'}`}>
      <div className={isDesktop ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : 'flex flex-col gap-1.5'}>
        <h2 className={`font-extrabold text-ink ${isDesktop ? 'text-[21px]' : 'text-[20px]'}`}>{DETAIL.treatment}</h2>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {summary && <span className={`font-bold text-ink ${isDesktop ? 'text-[16px]' : 'text-[15px]'}`}>{summary}</span>}
          {chips}
        </div>
      </div>
      {hasCalendar && <TreatmentCalendar key={consultation.id} meds={meds} selected={selectedDay} onSelect={chooseDay} today={todayKey} variant={variant} />}
      {!recordOnly && selectedDay && (
        <h3 className={`mt-1 font-black text-ink ${isDesktop ? 'text-[19px]' : 'text-[18px]'}`}>{dayTitle(isToday, longDay(selectedDay))}</h3>
      )}
      {meds.map(({ number, medication }) => (
        <MedicationCard
          key={medication.id}
          consultationId={consultation.id}
          medication={medication}
          number={number}
          variant={variant}
          day={selectedDay}
          today={todayKey}
          recordOnly={recordOnly}
          canManage={access.canAdd}
          cabinet={cabinetAccess(account).canAdd ? { consultDate: consultation.consultDate, doctor: consultation.doctorName } : undefined}
        />
      ))}
    </section>
  )
  const appointment = <ConsultationAppointmentSection consultationId={consultation.id} subject={subject} />
  // A Tutor that sees somebody's own consultation chooses its reminders (specs/058); off until they turn them on.
  const reminders = consultation.myReminders !== undefined && <OwnRemindersCard consultationId={consultation.id} on={consultation.myReminders} />
  const data = <ConsultationData key={consultation.id} consultation={consultation} desktop={isDesktop} onPhoto={() => setViewerOpen(true)} />
  const failed = appointmentFailed && <Notice tone="info">{DETAIL.appointmentFailed}</Notice>
  const viewer = viewerOpen && hasPhoto && <PhotoViewer src={photoSrc} onClose={() => setViewerOpen(false)} />

  if (isDesktop)
    return shell(
      <>
        {header}
        {failed}
        <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-7">
          {treatmentSection}
          <aside className="sticky top-6 flex min-w-0 flex-col gap-4">
            {appointment}
            {reminders}
            {data}
            {/* specs/022: the key of the treatment calendar, only in the web design. */}
            {hasCalendar && <CalendarLegendCard />}
          </aside>
        </div>
        {viewer}
      </>,
    )

  return shell(
    <>
      {header}
      <div className="flex flex-col gap-5 px-5">
        {failed}
        {treatmentSection}
        {appointment}
        {reminders}
        {data}
      </div>
      {viewer}
    </>,
  )
}
