import type { HistorySearchRequest } from '../consultations/historyCriteria'

// specs/050: the request and the answer of `POST /children/{childId}/export` (contracts/api.md). The answer is only what is
// already registered: the document never computes anything that judges it (Principio I).

/** The period the parent chose: everything, a range of days ("YYYY-MM-DD"), or the history's current filters. */
export type ExportPeriod =
  | { kind: 'all' }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'filters'; filters: HistorySearchRequest }

export interface ExportSections {
  consultations: boolean
  vaccinations: boolean
  photos: boolean
}

export interface ExportRequest {
  period: ExportPeriod
  sections: ExportSections
}

export interface ExportChild {
  firstName: string
  lastName: string
  /** "YYYY-MM-DD". */
  birthDate: string
  /** cm and kg; null when not written down. */
  height: number | null
  weight: number | null
}

export interface ExportActiveTreatment {
  medicationName: string
  frequencyHours: number
  /** The instant of its first dose. */
  since: string
  doctorName: string
}

export interface ExportAppointment {
  scheduledAt: string
  doctorName: string
  location: string
}

/** The letters of `ExportDoseCounts.sequence`: taken, unregistered (spec 013), due («por marcar»), pending (ahead). */
export type DoseLetter = 't' | 'u' | 'd' | 'p'

export interface ExportDoseCounts {
  taken: number
  unregistered: number
  due: number
  pending: number
  /** The doses of the schedule, without the ones canceled by ending the treatment. */
  total: number
  /** Each counted dose's status in schedule order, one letter per dose. */
  sequence: string
}

export interface ExportMedication {
  name: string
  frequencyHours: number
  durationDays: number
  /** "HH:MM"; null in a record-only consultation. */
  startTime: string | null
  endedAt: string | null
  extensions: { createdAt: string; addedDoses: number }[]
  doses: ExportDoseCounts
  firstDoseAt: string | null
  lastDoseAt: string | null
  lastMark: { at: string; by: string } | null
}

export interface ExportConsultation {
  id: string
  /** "YYYY-MM-DD". */
  consultDate: string
  doctorName: string
  recordOnly: boolean
  notes: string
  symptoms: { code: string; name: string }[]
  hasPhoto: boolean
  medications: ExportMedication[]
  appointment: ExportAppointment | null
}

export interface ExportVaccination {
  id: string
  name: string
  /** A name the family wrote (not from the catalog). */
  custom: boolean
  doseNumber: number | null
  /** "YYYY-MM-DD". */
  appliedOn: string
  lot: string | null
  place: string | null
  notes: string | null
  corrected: { at: string; by: string | null } | null
}

export interface ExportPhotos {
  consultations: { consultationId: string; consultDate: string; doctorName: string }[]
  card: { id: string; createdAt: string }[]
}

export interface ExportData {
  child: ExportChild
  activeTreatment: ExportActiveTreatment | null
  nextAppointment: ExportAppointment | null
  /** The consultations of the period, the most recent first ([] if the section wasn't asked for). */
  consultations: ExportConsultation[]
  /** The whole card, whatever the period ([] if the section wasn't asked for). */
  vaccinations: ExportVaccination[]
  /** null when the photos weren't asked for. */
  photos: ExportPhotos | null
}
