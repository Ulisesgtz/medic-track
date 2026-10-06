import type { Symptom } from '../../shared/catalog/api'

export type { Symptom }

// Mirrors contracts/get-consultations.md's response shape (+ specs/012: notes, symptomNames).
/** The names already registered for a child, for the history's choice lists (specs/031). */
export interface HistoryOptions {
  doctors: string[]
  medications: string[]
}

export interface ConsultationSummary {
  id: string
  doctorName: string
  consultDate: string
  /** "Notas previas a la consulta" — the old free-text symptoms of earlier consultations. */
  notes: string
  /** The marked symptoms' names, in catalog order ([] when none). */
  symptomNames: string[]
  medicationCount: number
  /** Saved only as a record (specs/024): no schedule, no doses. Optional: a backend that predates it doesn't send it. */
  recordOnly?: boolean
}

/**
 * specs/013: pending (its time hasn't come), due ("por marcar"), taken, or unregistered ("sin registrar": the next dose
 * of its medication came and nobody marked it), or canceled (specs/016: the treatment was ended before its time
 * came). Computed by the server with its own clock.
 */
export type DoseStatus = 'pending' | 'due' | 'taken' | 'unregistered' | 'canceled'

// Mirrors contracts/get-consultation-detail.md's response shape.
/** Who marked a dose and when (specs/032): the first name of the person, never their e-mail. */
export interface TakenBy {
  name: string
  at: string
  /** The session's own account marked it: it may take its own mark back (anybody else's only who can do everything may). */
  mine?: boolean
}

export interface Dose {
  id: string
  scheduledAt: string
  taken: boolean
  status: DoseStatus
  /** Who marked it; null if it isn't marked or was marked before the family could share. Optional: an older backend doesn't send it. */
  takenBy?: TakenBy | null
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
  /** Saved only as a record (specs/024): no schedule, no doses. Optional: a backend that predates it doesn't send it. */
  recordOnly?: boolean
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
  takenBy?: TakenBy | null
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
