// Mirrors contracts/get-consultations.md's response shape.
export interface ConsultationSummary {
  id: string
  doctorName: string
  consultDate: string
  symptoms: string
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
  symptoms: string
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
