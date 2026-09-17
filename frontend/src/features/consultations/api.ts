import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import type { ConsultationDetail, ConsultationSummary, Dose } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type { ValidationErrorDetail }

/** Discriminated error thrown by this feature's api functions. */
export class ConsultationApiError extends ApiError<
  'child_not_found' | 'consultation_not_found' | 'dose_not_found' | 'validation_error' | 'unknown'
> {}

// contracts/get-consultations.md
export async function fetchConsultations(childId: string): Promise<ConsultationSummary[]> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}/consultations`)
  const body = await res.json()

  if (res.ok) {
    return body.consultations as ConsultationSummary[]
  }
  if (res.status === 404) {
    throw new ConsultationApiError('child_not_found', body.message ?? 'Child not found')
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error fetching consultations')
}

export interface CreateMedicationPayload {
  name: string
  frequencyHours: number
  durationDays: number
  startTime?: string
}

export interface CreateConsultationPayload {
  doctorName: string
  consultDate: string
  photoBase64: string
  symptoms?: string
  medications: CreateMedicationPayload[]
}

// contracts/post-consultations.md
export async function createConsultation(
  childId: string,
  payload: CreateConsultationPayload,
): Promise<ConsultationDetail> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}/consultations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json()

  if (res.ok) {
    return body as ConsultationDetail
  }
  if (res.status === 404) {
    throw new ConsultationApiError('child_not_found', body.message ?? 'Child not found')
  }
  if (res.status === 400) {
    throw new ConsultationApiError('validation_error', body.message ?? 'Validation error', body.details)
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error creating consultation')
}

// contracts/get-consultation-detail.md
export async function fetchConsultationDetail(consultationId: string): Promise<ConsultationDetail> {
  const res = await fetch(`${API_BASE_URL}/consultations/${consultationId}`)
  const body = await res.json()

  if (res.ok) {
    return body as ConsultationDetail
  }
  if (res.status === 404) {
    throw new ConsultationApiError('consultation_not_found', body.message ?? 'Consultation not found')
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error fetching consultation')
}

// contracts/patch-dose.md
export async function updateDoseStatus(
  consultationId: string,
  doseId: string,
  taken: boolean,
): Promise<Dose> {
  const res = await fetch(`${API_BASE_URL}/consultations/${consultationId}/doses/${doseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taken }),
  })
  const body = await res.json()

  if (res.ok) {
    return body as Dose
  }
  if (res.status === 404) {
    throw new ConsultationApiError('dose_not_found', body.message ?? 'Dose not found')
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error updating dose')
}
