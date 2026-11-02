import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatDateShort, formatTime } from '../../shared/date'
import { DayIcon } from '../../shared/ui/DayRow'
import { ChildAccessBlock } from '../childDevice/parent/ChildAccessBlock'
import { useDeviceLinks } from '../childDevice/parent/parentHooks'
import { consultationLine } from '../consultations/consultationLine'
import { HistoryEntry } from '../consultations/HistoryEntry'
import { RecordOnlyBadge } from '../consultations/RecordOnlyBadge'
import type { ActiveTreatment, ConsultationSummary } from '../consultations/types'
import { useFamily } from '../family/useFamily'
import { familyMembers } from '../home/homeText'
import { useChildDay } from '../home/useChildDay'
import { ExportEntry } from '../pdfExport/ExportEntry'
import { usePhotos, useVaccinations } from '../vaccinations/hooks'
import { entrySummary } from '../vaccinations/vaccineText'
import {
  CHILD,
  activitiesDone,
  nameAtTime,
  phones,
  summaryDoses,
  treatmentEnds,
  treatmentName,
} from './childDetailText'

type Variant = 'phone' | 'desktop'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outline =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[14px] border-2 border-action bg-transparent font-extrabold text-action hover:bg-hint'
const planChip = 'shrink-0 rounded-full border border-hint-border bg-hint px-[9px] py-[3px] text-[12px] font-extrabold text-action'
const chevron = (
  <span aria-hidden="true" className="text-[22px] text-action">
    ›
  </span>
)

/** A consultation: a sheet with a cross, on `hint` (the design's icon tile). */
function ConsultationIcon() {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-hint">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="stroke-action" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
        <path d="M12 8.5v6M9 11.5h6" />
      </svg>
    </span>
  )
}

/** The section heading of the page (design A: 18 px on the phone, 19 px on the web, in a 44 px row). */
export function SectionTitle({ children, variant, aside }: { children: ReactNode; variant: Variant; aside?: ReactNode }) {
  const desktop = variant === 'desktop'
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className={`font-extrabold text-ink ${desktop ? 'text-[19px]' : 'text-[18px]'}`}>{children}</h2>
      {aside}
    </div>
  )
}

/** «Tratamiento activo · Amoxicilina +1 · termina el 4 nov» (derived by the server; the overview names no consultation, so no link). */
export function TreatmentCard({ treatment, variant }: { treatment: ActiveTreatment; variant: Variant }) {
  const name = treatmentName(treatment.medicationName, treatment.otherCount)
  if (variant === 'desktop')
    return (
      <section aria-label={CHILD.treatment} className={`${card} flex flex-col gap-1 p-[18px]`}>
        <span className="text-[13px] font-bold text-muted">{CHILD.treatment}</span>
        <span className="text-[17px] font-extrabold text-ink">{name}</span>
        <span className="text-[15px] text-body">{treatmentEnds(treatment.endsAt)}</span>
      </section>
    )
  return (
    <section aria-label={CHILD.treatment} className={`${card} flex items-center gap-3 px-4 py-3.5`}>
      <DayIcon kind="med" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-bold text-muted">{CHILD.treatment}</span>
        <span className="text-[16px] font-extrabold text-ink">
          {name} <span className="font-medium text-body">· {treatmentEnds(treatment.endsAt)}</span>
        </span>
      </span>
    </section>
  )
}

/**
 * «Consultas»: one compact row per consultation (date, doctor, what was registered, «Solo registro»), «Buscar en el historial» and
 * «Exportar a PDF» (each with the «Plan completo» mark on the free plan), or the empty block that explains «Nueva consulta».
 */
export function ConsultationsSection({
  consultations,
  status,
  childId,
  child,
  free,
  variant,
}: {
  consultations: ConsultationSummary[]
  status: 'loading' | 'error' | 'ready'
  childId: string
  child: { firstName: string; lastName: string } | undefined
  free: boolean
  variant: Variant
}) {
  const desktop = variant === 'desktop'
  const size = desktop ? 'px-3.5 text-[14px]' : 'w-full px-4 text-[15px]'
  const actions = consultations.length > 0 && (
    <div className={desktop ? 'flex gap-2' : 'flex flex-col gap-2'}>
      <HistoryEntry to={`/children/${childId}/historial`} free={free} className={`${outline} ${size}`}>
        {CHILD.search}
      </HistoryEntry>
      {child && (
        <ExportEntry
          variant={desktop ? 'desktop' : 'phone'}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-[14px] ${size}`}
          childId={childId}
          child={child}
          free={free}
          filters={null}
        />
      )}
    </div>
  )
  const body =
    status === 'loading' ? (
      <p className="text-[15px] text-muted">Cargando…</p>
    ) : status === 'error' ? (
      <p role="alert" className="text-[15px] text-body">
        {CHILD.loadFailedList}
      </p>
    ) : consultations.length === 0 ? (
      <div className={`flex flex-col gap-1.5 rounded-[22px] border-2 border-dashed border-hint-border ${desktop ? 'p-6' : 'px-[18px] py-5'}`}>
        <span className={`font-extrabold text-ink ${desktop ? 'text-[17px]' : 'text-[16px]'}`}>{CHILD.noConsultations}</span>
        <span className="text-[15px] leading-normal text-body">{CHILD.noConsultationsText}</span>
      </div>
    ) : (
      <div className={`${card} overflow-hidden`}>
        {consultations.map((c) =>
          desktop ? (
            <Link
              key={c.id}
              to={`/consultations/${c.id}`}
              className="flex min-h-16 items-center gap-3.5 border-b border-hint-edge px-5 py-3 last:border-b-0 hover:bg-canvas"
            >
              <ConsultationIcon />
              <span className="w-[110px] shrink-0 text-[15px] font-extrabold text-ink">{formatDateShort(c.consultDate)}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold text-ink">{c.doctorName}</span>
                <span className="text-[14px] text-body">{consultationLine(c)}</span>
              </span>
              {c.recordOnly && <RecordOnlyBadge />}
              {chevron}
            </Link>
          ) : (
            <Link key={c.id} to={`/consultations/${c.id}`} className="flex min-h-[68px] items-center gap-3 border-b border-hint-edge px-4 py-3 last:border-b-0">
              <ConsultationIcon />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="text-[15px] font-extrabold text-ink">
                  {formatDateShort(c.consultDate)} <span className="font-medium text-body">· {c.doctorName}</span>
                </span>
                <span className="text-[14px] text-body">{consultationLine(c)}</span>
                {c.recordOnly && <RecordOnlyBadge />}
              </span>
              {chevron}
            </Link>
          ),
        )}
      </div>
    )
  return (
    <section id="consultas" aria-label={CHILD.consultations} className={`flex scroll-mt-16 flex-col ${desktop ? 'gap-3' : 'gap-2.5'}`}>
      <SectionTitle variant={variant} aside={desktop ? actions : undefined}>
        {CHILD.consultations}
      </SectionTitle>
      {body}
      {!desktop && actions}
    </section>
  )
}

/** «Cartilla de vacunación»: what was recorded and a link; the sentence that the app compares it with nothing (specs/046). */
export function CartillaSection({ childId, canAdd, variant }: { childId: string; canAdd: boolean; variant: Variant }) {
  const doses = useVaccinations(childId)
  const photos = usePhotos(childId)
  const desktop = variant === 'desktop'
  const known = doses.isSuccess
  const count = doses.data?.length ?? 0
  const photoCount = photos.data?.photos.length ?? 0
  const empty = known && count === 0 && photoCount === 0
  const link = empty && canAdd ? CHILD.cartillaAdd : CHILD.cartillaLink
  const summary = known ? entrySummary(count, photoCount) : CHILD.cartillaTitle
  return (
    <section id="cartilla" aria-label={CHILD.cartillaTitle} className={`flex scroll-mt-16 flex-col ${desktop ? 'gap-3' : 'gap-2.5'}`}>
      <SectionTitle variant={variant}>{CHILD.cartillaTitle}</SectionTitle>
      <Link to={`/children/${childId}/cartilla`} className={`${card} flex items-center ${desktop ? 'gap-3.5 px-5 py-4' : 'gap-3 px-4 py-3.5'}`}>
        <DayIcon kind="act" />
        {desktop ? (
          <>
            <span className="flex-1 text-[15px] font-extrabold text-ink">{summary}</span>
            <span className="text-[14px] font-bold text-action">{link} ›</span>
          </>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-extrabold text-ink">{summary}</span>
              <span className="text-[14px] font-bold text-action">{link}</span>
            </span>
            {chevron}
          </>
        )}
      </Link>
      <p className={`leading-normal text-body ${desktop ? 'text-[14px]' : 'text-[13px]'}`}>{CHILD.cartillaNote}</p>
    </section>
  )
}

/** The web's «Resumen del día» (right column): only counts of the server's `status`. */
export function DaySummaryCard({ childId }: { childId: string }) {
  const { day, overview } = useChildDay(childId)
  if (!day || !overview) return null
  const doses = overview.doses.filter((d) => d.status !== 'canceled')
  const rows: { t: string; v: string }[] = [
    { t: CHILD.summaryDoses, v: doses.length ? summaryDoses(doses.length, day.toMark, doses.filter((d) => d.taken).length) : CHILD.noneToday },
  ]
  if (day.unregistered) rows.push({ t: CHILD.summaryUnregistered, v: nameAtTime(day.unregistered.medicationName, formatTime(day.unregistered.scheduledAt)) })
  else if (day.next) rows.push({ t: CHILD.summaryNext, v: nameAtTime(day.next.medicationName, formatTime(day.next.scheduledAt)) })
  rows.push({ t: CHILD.activities, v: day.activities ? activitiesDone(day.activities.done, day.activities.total) : CHILD.noneToday })
  return <DaySummaryView rows={rows} />
}

/** «Resumen del día» itself: a title and a row per thing counted (the child's detail and «Mi día» on the web). */
export function DaySummaryView({ rows }: { rows: { t: string; v: string }[] }) {
  return (
    <section aria-label={CHILD.summary} className="flex flex-col rounded-[22px] border-[1.5px] border-hint-edge bg-surface px-[18px] py-4">
      <h2 className="pb-1.5 text-[15px] font-extrabold text-ink">{CHILD.summary}</h2>
      {rows.map((r) => (
        <div key={r.t} className="flex min-h-10 items-center justify-between gap-2.5 border-t border-hint-edge">
          <span className="text-[14px] font-bold text-muted">{r.t}</span>
          <span className="text-right text-[14px] font-bold text-ink">{r.v}</span>
        </div>
      ))}
    </section>
  )
}

/**
 * «Lo demás» (design A): «Acceso del hijo» (the row opens the block of specs/047 right under it — there is no page for it) and
 * «Familia que lo ve» (to /familia). Rows of 52 px on the phone, a strip of two on the web.
 */
export function MoreRows({
  childId,
  childName,
  canAdd,
  free,
  variant,
}: {
  childId: string
  childName: string
  canAdd: boolean
  free: boolean
  variant: Variant
}) {
  const [accessOpen, setAccessOpen] = useState(false)
  const links = useDeviceLinks(childId).data?.links
  const family = useFamily().data
  const desktop = variant === 'desktop'
  const members = family && Array.isArray(family.members) ? family.members.length + 1 : null
  const row = desktop ? 'flex min-h-16 items-center justify-between gap-3 px-4 py-2.5 hover:bg-hint' : 'flex min-h-[52px] items-center justify-between gap-3 border-b border-hint-edge'
  const accessValue = free ? <span className={planChip}>{CHILD.planMark}</span> : links ? <span className="text-[14px] text-body">{links.length ? phones(links.length) : CHILD.createLink}</span> : null
  return (
    <>
      <nav
        aria-label={CHILD.more}
        className={desktop ? 'grid grid-cols-2 border-y border-hint-edge' : 'mt-2 flex flex-col border-t border-hint-edge'}
      >
        {canAdd && (
          <button type="button" aria-expanded={accessOpen} onClick={() => setAccessOpen((o) => !o)} className={`${row} w-full cursor-pointer text-left`}>
            <span className="text-[15px] font-bold text-ink">{CHILD.childAccess}</span>
            {accessValue}
          </button>
        )}
        <Link to="/familia" className={row}>
          <span className="text-[15px] font-bold text-ink">{CHILD.familyWhoSees}</span>
          {members !== null && <span className="text-[14px] text-body">{familyMembers(members)}</span>}
        </Link>
      </nav>
      {accessOpen && <ChildAccessBlock childId={childId} childName={childName} />}
    </>
  )
}
