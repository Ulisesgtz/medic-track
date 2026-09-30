import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { ChildOverview, ConsultationDetail, ConsultationSummary, Dose, Medication } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type { ValidationErrorDetail }

/** Discriminated error thrown by this feature's api functions. */
export class ConsultationApiError extends ApiError<
  'child_not_found' | 'consultation_not_found' | 'dose_not_found' | 'medication_not_found' | 'nothing_to_extend' | 'validation_error' | 'symptom_not_available' | 'unknown'
> {}

// contracts/get-consultations.md
export async function fetchConsultations(childId: string, token: string | null): Promise<ConsultationSummary[]> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}/consultations`, { headers: withAuthHeader(token) })
  const body = await res.json()

  if (res.ok) {
    return body.consultations as ConsultationSummary[]
  }
  if (res.status === 404 || res.status === 403) {
    throw new ConsultationApiError('child_not_found', body.message ?? 'Child not found')
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error fetching consultations')
}

// contracts/get-overview.md — the doses inside [from, to) (the parent's local
// "today") and the treatment still running.
export async function fetchChildOverview(childId: string, from: Date, to: Date, token: string | null): Promise<ChildOverview> {
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  const res = await fetch(`${API_BASE_URL}/children/${childId}/overview?${query}`, { headers: withAuthHeader(token) })
  const body = await res.json()

  if (res.ok) {
    return body as ChildOverview
  }
  if (res.status === 404 || res.status === 403) {
    throw new ConsultationApiError('child_not_found', body.message ?? 'Child not found')
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error fetching the overview')
}

export interface CreateMedicationPayload {
  name: string
  frequencyHours: number
  durationDays: number
  startTime: string
}

export interface CreateConsultationPayload {
  doctorName: string
  consultDate: string
  photoBase64: string
  notes?: string
  /** Catalog codes of the marked symptoms (specs/012). */
  symptomCodes?: string[]
  medications: CreateMedicationPayload[]
  /** The parent's UTC offset, so each medication's start time is read in their own time zone. */
  utcOffsetMinutes: number
}

// contracts/post-consultations.md
export async function createConsultation(
  childId: string,
  payload: CreateConsultationPayload,
  token: string | null,
): Promise<ConsultationDetail> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}/consultations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify(payload),
  })
  const body = await res.json()

  if (res.ok) {
    return body as ConsultationDetail
  }
  if (res.status === 404 || res.status === 403) {
    throw new ConsultationApiError('child_not_found', body.message ?? 'Child not found')
  }
  if (res.status === 400 && body.details?.some((d: ValidationErrorDetail) => d.message === 'symptom_not_available')) {
    // A chosen symptom was retired from the catalog meanwhile (specs/012 FR-010).
    throw new ConsultationApiError('symptom_not_available', body.message ?? 'Symptom not available', body.details)
  }
  if (res.status === 400) {
    throw new ConsultationApiError('validation_error', body.message ?? 'Validation error', body.details)
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error creating consultation')
}

// contracts/get-consultation-detail.md
export async function fetchConsultationDetail(consultationId: string, token: string | null): Promise<ConsultationDetail> {
  const res = await fetch(`${API_BASE_URL}/consultations/${consultationId}`, { headers: withAuthHeader(token) })
  const body = await res.json()

  if (res.ok) {
    return body as ConsultationDetail
  }
  if (res.status === 404 || res.status === 403) {
    throw new ConsultationApiError('consultation_not_found', body.message ?? 'Consultation not found')
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error fetching consultation')
}

// contracts/patch-dose.md
// specs/016 contracts/medication-end.md — ends one medication's treatment early (irreversible, idempotent).
export async function endTreatment(consultationId: string, medicationId: string, token: string | null): Promise<Medication> {
  const res = await fetch(`${API_BASE_URL}/consultations/${consultationId}/medications/${medicationId}/end`, {
    method: 'POST',
    headers: withAuthHeader(token),
  })
  const body = await res.json()

  if (res.ok) {
    return body as Medication
  }
  if (res.status === 404 || res.status === 403) {
    throw new ConsultationApiError('medication_not_found', body.message ?? 'Medication not found')
  }
  if (res.status === 400) {
    throw new ConsultationApiError('validation_error', body.message ?? 'Nothing to end', body.details)
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error ending the treatment')
}

// specs/020 contracts/medication-extend.md — adds `doses` doses to the end of a medication, because the parent decided so.
export async function extendTreatment(
  consultationId: string,
  medicationId: string,
  doses: number,
  token: string | null,
): Promise<Medication> {
  const res = await fetch(`${API_BASE_URL}/consultations/${consultationId}/medications/${medicationId}/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ doses }),
  })
  const body = await res.json()

  if (res.ok) {
    return body as Medication
  }
  if (res.status === 404 || res.status === 403) {
    throw new ConsultationApiError('medication_not_found', body.message ?? 'Medication not found')
  }
  if (res.status === 400) {
    const nothing = (body.details as { message?: string }[] | undefined)?.some((d) => d.message === 'nothing_to_extend')
    throw new ConsultationApiError(nothing ? 'nothing_to_extend' : 'validation_error', body.message ?? 'Invalid request', body.details)
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error extending the treatment')
}

export async function updateDoseStatus(
  consultationId: string,
  doseId: string,
  taken: boolean,
  token: string | null,
): Promise<Dose> {
  const res = await fetch(`${API_BASE_URL}/consultations/${consultationId}/doses/${doseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ taken }),
  })
  const body = await res.json()

  if (res.ok) {
    return body as Dose
  }
  if (res.status === 404 || res.status === 403) {
    throw new ConsultationApiError('dose_not_found', body.message ?? 'Dose not found')
  }
  throw new ConsultationApiError('unknown', body.message ?? 'Unexpected error updating dose')
}
