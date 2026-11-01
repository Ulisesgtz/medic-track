import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { ExportData, ExportRequest } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// specs/050 (contracts/api.md): what the PDF is made of. The criterion goes in the body, never in the address (a typed text can
// be health information, and addresses reach logs the family doesn't control). Every call takes a `signal`: «Cancelar» stops it.

/** Discriminated error of the export's calls. */
export class ExportApiError extends ApiError<'plan_required' | 'validation_error' | 'forbidden' | 'unknown'> {}

interface ErrorBody {
  error?: string
  reason?: string
  message?: string
  details?: ValidationErrorDetail[]
}

async function readBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody
  } catch {
    return {}
  }
}

function exportError(status: number, body: ErrorBody, fallback: string): ExportApiError {
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded' && body.reason === 'pdf_export') {
    return new ExportApiError('plan_required', body.message ?? 'Exporting is part of the paid plan')
  }
  if (status === 400) return new ExportApiError('validation_error', body.message ?? 'Validation error', body.details)
  if (status === 403 || status === 404) return new ExportApiError('forbidden', body.message ?? 'Not found')
  return new ExportApiError('unknown', body.message ?? fallback)
}

/** POST /children/{childId}/export: the child's registered data for the PDF. The plan is decided by the server (422 `pdf_export`). */
export async function fetchExportData(childId: string, request: ExportRequest, token: string | null, signal?: AbortSignal): Promise<ExportData> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify(request),
    signal,
  })
  if (res.ok) return (await res.json()) as ExportData
  throw exportError(res.status, await readBody(res), 'Unexpected error preparing the export')
}

async function photo(path: string, token: string | null, signal: AbortSignal | undefined, fallback: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: withAuthHeader(token), signal })
  if (res.ok) return ((await res.json()) as { photoBase64?: string }).photoBase64 ?? ''
  throw exportError(res.status, await readBody(res), fallback)
}

/** GET /consultations/{id}/photo: the prescription's photo as base64 ('' if the consultation was saved without one). */
export const fetchConsultationPhoto = (consultationId: string, token: string | null, signal?: AbortSignal) =>
  photo(`/consultations/${consultationId}/photo`, token, signal, 'Unexpected error fetching the prescription photo')

/** GET /children/{childId}/vaccine-card-photos/{id}: one photo of the paper card as base64 (specs/046). */
export const fetchCardPhoto = (childId: string, photoId: string, token: string | null, signal?: AbortSignal) =>
  photo(`/children/${childId}/vaccine-card-photos/${photoId}`, token, signal, 'Unexpected error fetching the card photo')
