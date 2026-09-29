import type { Symptom } from '../../shared/catalog/api'

export type { Symptom }

// Mirrors contracts/get-consultations.md's response shape (+ specs/012: notes, symptomNames).
export interface ConsultationSummary {
  id: string
  doctorName: string
  consultDate: string
  /** "Notas previas a la consulta" — the old free-text symptoms of earlier consultations. */
  notes: string
  /** The marked symptoms' names, in catalog order ([] when none). */
  symptomNames: string[]
  medicationCount: number
}

// Mirrors contracts/get-consultation-detail.md's response shape.
export interface Dose {
  id: string
  scheduledAt: string
  taken: boolean
}

export interface Medication {
  id: string
  name: string
  frequencyHours: number
  durationDays: number
  startTime: string | null
  doses: Dose[]
}

export interface ConsultationDetail {
  id: string
  childId: string
  doctorName: string
  consultDate: string
  photoBase64: string
  notes: string
  /** The marked symptoms in catalog order, retired ones included ([] when none). */
  symptoms: Symptom[]
  medications: Medication[]
}

// Mirrors specs/006-resumen-detalle-hijo/contracts/get-overview.md.
export interface OverviewDose {
  id: string
  consultationId: string
  medicationName: string
  scheduledAt: string
  taken: boolean
}

export interface ActiveTreatment {
  medicationName: string
  endsAt: string
  otherCount: number
}

export interface ChildOverview {
  childId: string
  doses: OverviewDose[]
  activeTreatment: ActiveTreatment | null
}
