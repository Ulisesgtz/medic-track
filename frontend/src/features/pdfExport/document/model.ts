import { formatTime } from '../../../shared/date'
import type { HistorySearchRequest } from '../../consultations/historyCriteria'
import { DOC } from '../exportText'
import type {
  DoseLetter,
  ExportActiveTreatment,
  ExportAppointment,
  ExportChild,
  ExportData,
  ExportMedication,
  ExportPeriod,
  ExportRequest,
  ExportVaccination,
} from '../types'

// specs/050: what each part of the document says, as pure functions over the export's data. The document only arranges and
// counts what was registered (Principio I); every sentence comes from exportText.ts.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const pad = (n: number) => String(n).padStart(2, '0')

/** A plain "YYYY-MM-DD" as the mock writes it: «5 ene 2019» (no leading zero, unlike the app's cards). */
export function day(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined
  if (!match || !month) return iso
  return `${Number(match[3])} ${month} ${match[1]}`
}

/** The local day of an instant as "YYYY-MM-DD". */
export function localIso(instant: string | Date): string {
  const d = new Date(instant)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The local day of an instant: «18 oct 2026». */
export const localDay = (instant: string | Date) => day(localIso(instant))

/** The local day and month of an instant: «24 oct». */
export function localDayMonth(instant: string | Date): string {
  const d = new Date(instant)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** «Mateo Morales». */
export const fullName = (child: Pick<ExportChild, 'firstName' | 'lastName'>) => `${child.firstName} ${child.lastName}`.trim()

/** «Mateo-Morales-historial-24-oct-2026.pdf»: the local day it was made, without accents, spaces or anything a file system minds. */
export function fileName(child: Pick<ExportChild, 'firstName' | 'lastName'>, now: Date): string {
  const words = fullName(child)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const name = words || 'Hijo'
  return `${name}-historial-${now.getDate()}-${MONTHS[now.getMonth()]}-${now.getFullYear()}.pdf`
}

/** Whole months between the birth and the local day of `now`. */
function monthsSince(birthDate: string, now: Date): number {
  const [y, m, d] = birthDate.split('-').map(Number)
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
  if (now.getDate() < d) months -= 1
  return Math.max(0, months)
}

/** «5 años 7 meses», «1 año 2 meses», «7 meses» (the mock counts years from the first one). */
export function ageText(birthDate: string, now: Date): string {
  const months = monthsSince(birthDate, now)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return plural(rest, 'mes', 'meses')
  return rest === 0 ? plural(years, 'año', 'años') : `${plural(years, 'año', 'años')} ${plural(rest, 'mes', 'meses')}`
}

/** The cover's «Periodo». */
export function periodText(period: ExportPeriod): string {
  if (period.kind === 'range') return DOC.periodRange(day(period.from), day(period.to))
  if (period.kind === 'filters') return DOC.periodFilters
  return DOC.periodAll
}

const KIND_LABEL: Record<NonNullable<HistorySearchRequest['kind']>, string> = {
  all: 'Todas',
  treatment: 'Con tratamiento',
  record: 'Solo registro',
}

/** The cover's «Filtros»: each criterion of the history in words, or «Sin filtros». Symptoms by their catalog name. */
export function filtersText(period: ExportPeriod, symptomNames: Record<string, string> = {}): string {
  if (period.kind !== 'filters') return DOC.noFilters
  const f = period.filters
  const parts: string[] = []
  if (f.from && f.to) parts.push(`Fechas: del ${day(f.from)} al ${day(f.to)}`)
  else if (f.from) parts.push(`Fechas: desde el ${day(f.from)}`)
  else if (f.to) parts.push(`Fechas: hasta el ${day(f.to)}`)
  if (f.q?.trim()) parts.push(`Texto: «${f.q.trim()}»`)
  if (f.doctor) parts.push(`Doctor: ${f.doctor}`)
  if (f.medication) parts.push(`Medicamento: ${f.medication}`)
  if (f.symptomCodes?.length) parts.push(`Síntomas: ${f.symptomCodes.map((code) => symptomNames[code] ?? code).join(', ')}`)
  if (f.kind && f.kind !== 'all') parts.push(`Tipo: ${KIND_LABEL[f.kind]}`)
  return parts.length > 0 ? parts.join(' · ') : DOC.noFilters
}

/** The cover's «Secciones». */
export function sectionsText(sections: ExportRequest['sections']): string {
  const parts: string[] = []
  if (sections.consultations) parts.push(DOC.sectionConsultations)
  if (sections.vaccinations) parts.push(DOC.sectionCard)
  if (sections.photos) parts.push(DOC.sectionPhotos)
  return parts.join(' · ')
}

export interface CoverRow {
  label: string
  value: string
  strong?: boolean
}

/**
 * «Qué incluye este PDF»: the period, the filters, the sections and, as in the mock, «Fotos: No incluidas» when they weren't asked
 * for, and «Cartilla: Todas las vacunas registradas, sin filtro de periodo» when the period narrows the consultations and the card
 * has something to say so of.
 */
export function coverRows(request: ExportRequest, data: ExportData, symptomNames: Record<string, string> = {}): CoverRow[] {
  const rows: CoverRow[] = [
    { label: DOC.periodLabel, value: periodText(request.period), strong: true },
    { label: DOC.filtersLabel, value: filtersText(request.period, symptomNames) },
    { label: DOC.sectionsLabel, value: sectionsText(request.sections) },
  ]
  if (request.sections.vaccinations && request.period.kind !== 'all' && data.vaccinations.length > 0) {
    rows.push({ label: DOC.cardLabel, value: DOC.cardWhole })
  }
  if (!request.sections.photos) rows.push({ label: DOC.photosLabel, value: DOC.photosNotIncluded })
  return rows
}

/** The cover's count line: «4 consultas · 10 vacunas registradas · 2 fotos de la cartilla · 1 foto de receta». */
export function coverCount(request: ExportRequest, data: ExportData): string {
  const parts: string[] = []
  if (request.sections.consultations) parts.push(DOC.countConsultations(data.consultations.length))
  if (request.sections.vaccinations) parts.push(DOC.countVaccinations(data.vaccinations.length))
  if (request.sections.photos && data.photos) {
    if (data.photos.card.length > 0) parts.push(DOC.countCardPhotos(data.photos.card.length))
    if (data.photos.consultations.length > 0) parts.push(DOC.countPrescriptionPhotos(data.photos.consultations.length))
  }
  return parts.join(' · ')
}

/** «Cada 8 h · desde el 18 oct 2026» and «Indicado por …» of the running treatment. */
export function activeTreatmentLines(t: ExportActiveTreatment): { schedule: string; doctor: string | null } {
  return {
    schedule: DOC.activeSince(t.frequencyHours, localDay(t.since)),
    doctor: t.doctorName.trim() ? DOC.indicatedBy(t.doctorName.trim()) : null,
  }
}

/** When an appointment is: «28 oct 2026 · 10:30» (cover) or «28 oct 2026, 10:30» (in a consultation). */
export function appointmentWhen(a: Pick<ExportAppointment, 'scheduledAt'>, separator: ' · ' | ', '): string {
  return `${localDay(a.scheduledAt)}${separator}${formatTime(a.scheduledAt)}`
}

/** «cada 8 h · 7 días · primera toma 08:00 del 18 oct» (without the first dose in a record-only consultation). */
export function indication(med: ExportMedication, consultDate: string): string {
  const parts = [DOC.every(med.frequencyHours), DOC.days(med.durationDays)]
  if (med.startTime) {
    const first = med.firstDoseAt ? localDayMonth(med.firstDoseAt) : day(consultDate).replace(/ \d{4}$/, '')
    parts.push(DOC.firstDose(med.startTime, first))
  }
  return parts.join(' · ')
}

export interface StatusLabel {
  text: string
  /** The mock's dark border («En curso»); the rest have a grey one. */
  strong: boolean
}

/** «Terminado el 20 oct», or «En curso» while doses are ahead or waiting; then each «Se recorrió el 15 sep · +2 tomas». */
export function statusLabels(med: ExportMedication): StatusLabel[] {
  const labels: StatusLabel[] = []
  if (med.endedAt) labels.push({ text: DOC.endedOn(localDayMonth(med.endedAt)), strong: false })
  else if (med.doses.pending > 0 || med.doses.due > 0) labels.push({ text: DOC.running, strong: true })
  for (const e of med.extensions) labels.push({ text: DOC.extendedOn(localDayMonth(e.createdAt), e.addedDoses), strong: false })
  return labels
}

/** «Del 20 al 26 feb», «Del 28 feb al 6 mar», «Del 30 dic 2025 al 2 ene 2026». */
export function doseSpan(first: string, last: string): string {
  const a = localIso(first)
  const b = localIso(last)
  if (a.slice(0, 4) !== b.slice(0, 4)) return DOC.span(day(a), day(b))
  const lastText = localDayMonth(last)
  const firstText = a.slice(0, 7) === b.slice(0, 7) ? String(Number(a.slice(8))) : localDayMonth(first)
  return DOC.span(firstText, lastText)
}

/**
 * The record of a medication's doses, only counts (FR-014): «16 de 18 tomas marcadas» (of those whose time has come; the canceled ones
 * never count), then «2 sin registrar», «3 por venir», the days when nothing is left ahead and the treatment wasn't ended or extended,
 * and the last mark. `lead` is the bold part.
 */
export function doseRecord(med: ExportMedication): { lead: string | null; rest: string[] } {
  const { taken, unregistered, due, pending, total } = med.doses
  if (total === 0) return { lead: null, rest: [DOC.noDoseRecord] }
  const come = total - pending
  const rest: string[] = []
  if (unregistered > 0) rest.push(DOC.unregistered(unregistered))
  if (due > 0) rest.push(DOC.due(due))
  if (pending > 0) rest.push(DOC.ahead(pending))
  if (pending === 0 && statusLabels(med).length === 0 && med.firstDoseAt && med.lastDoseAt) {
    rest.push(doseSpan(med.firstDoseAt, med.lastDoseAt))
  }
  if (med.lastMark) rest.push(DOC.lastMark(localDayMonth(med.lastMark.at), formatTime(med.lastMark.at), med.lastMark.by))
  return { lead: come > 0 ? DOC.marked(taken, come) : null, rest }
}

const LETTERS: readonly DoseLetter[] = ['t', 'u', 'd', 'p']

/** One mark per dose, in schedule order, from the server's sequence (anything unknown is left out). */
export function doseMarks(med: ExportMedication): DoseLetter[] {
  return [...(med.doses.sequence ?? '')].filter((c): c is DoseLetter => LETTERS.includes(c as DoseLetter))
}

/** A name without case or accents (two doses written «Neumocócica» and «neumococica» are one vaccine). */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()

export interface VaccineGroup {
  name: string
  /** The family wrote the name (not from the catalog). */
  custom: boolean
  doses: ExportVaccination[]
}

/** The card by vaccine as the mock lists it: each group's doses oldest first, the groups by their first dose. */
export function vaccineGroups(vaccinations: ExportVaccination[]): VaccineGroup[] {
  const groups = new Map<string, VaccineGroup>()
  for (const v of vaccinations) {
    const key = `${v.custom ? 'own' : 'catalog'}:${fold(v.name)}`
    const group = groups.get(key)
    if (group) group.doses.push(v)
    else groups.set(key, { name: v.name, custom: v.custom, doses: [v] })
  }
  const list = [...groups.values()]
  const byDate = (a: ExportVaccination, b: ExportVaccination) =>
    a.appliedOn.localeCompare(b.appliedOn) || (a.doseNumber ?? 0) - (b.doseNumber ?? 0)
  for (const g of list) g.doses.sort(byDate)
  return list.sort((a, b) => a.doses[0].appliedOn.localeCompare(b.doses[0].appliedOn) || a.name.localeCompare(b.name, 'es'))
}

export interface VaccineRow {
  dose: string
  date: string
  lot: string
  place: string
  note: string
  corrected: string | null
}

const orDash = (text: string | null) => (text?.trim() ? text.trim() : DOC.empty)

/** One row of the card's table. */
export function vaccineRow(v: ExportVaccination): VaccineRow {
  return {
    dose: v.doseNumber ? DOC.doseNumber(v.doseNumber) : DOC.empty,
    date: day(v.appliedOn),
    lot: orDash(v.lot),
    place: orDash(v.place),
    note: orDash(v.notes),
    corrected: v.corrected ? DOC.correctedOn(localDayMonth(v.corrected.at), v.corrected.by) : null,
  }
}
