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

/**
 * specs/013: pending (its time hasn't come), due ("por marcar"), taken, or unregistered ("sin registrar": the next dose
 * of its medication came and nobody marked it), or canceled (specs/016: the treatment was ended before its time
 * came). Computed by the server with its own clock.
 */
export type DoseStatus = 'pending' | 'due' | 'taken' | 'unregistered' | 'canceled'

// Mirrors contracts/get-consultation-detail.md's response shape.
export interface Dose {
  id: string
  scheduledAt: string
  taken: boolean
  status: DoseStatus
}

/** One time the parent added doses to the end of a medication (specs/020). */
export interface MedicationExtension {
  createdAt: string
  /** What the app proposed: the unregistered doses not covered yet. */
  proposedDoses: number
  /** What the parent confirmed. */
  addedDoses: number
  /** True when the parent typed a number other than the proposed one. */
  manual: boolean
}

export interface Medication {
  id: string
  name: string
  frequencyHours: number
  durationDays: number
  startTime: string | null
  /** When the parent ended the treatment early (specs/016); null while it runs. */
  endedAt: string | null
  doses: Dose[]
  /** Unregistered doses not covered by an extension yet (specs/020): the number proposed; 0 once ended. */
  extendableDoses: number
  /** The parent's extensions, oldest first. */
  extensions: MedicationExtension[]
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
  status: DoseStatus
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
