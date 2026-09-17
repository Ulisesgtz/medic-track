// Mirrors contracts/get-consultations.md's response shape.
export interface ConsultationSummary {
  id: string
  doctorName: string
  consultDate: string
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
