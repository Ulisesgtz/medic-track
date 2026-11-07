import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { CabinetInput, CabinetItem, CabinetList } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** The errors of the cabinet's routes. The name, strength and note only ever travel in bodies. */
export class CabinetApiError extends ApiError<'plan_required' | 'limit' | 'validation_error' | 'not_found' | 'forbidden' | 'unknown'> {}

interface ErrorBody {
  error?: string
  message?: string
  reason?: string
  details?: ValidationErrorDetail[]
}

function errorFor(status: number, body: ErrorBody, fallback: string): CabinetApiError {
  const message = body.message ?? fallback
  if (status === 403) return new CabinetApiError('forbidden', message)
  if (status === 404) return new CabinetApiError('not_found', message)
  if (status === 400 && body.error === 'validation_error') return new CabinetApiError('validation_error', message, body.details)
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded') return new CabinetApiError('plan_required', message)
  if (status === 422 && body.error === 'cabinet_limit_exceeded') return new CabinetApiError('limit', message)
  return new CabinetApiError('unknown', message)
}

async function call<T>(method: string, path: string, token: string | null, body?: unknown, fallback = 'Unexpected error'): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...withAuthHeader(token) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = res.status === 204 ? undefined : await res.json().catch(() => ({}))
  if (res.ok) return json as T
  throw errorFor(res.status, (json ?? {}) as ErrorBody, fallback)
}

const base = (ownerId: string) => `/accounts/${ownerId}/medicine-cabinet`

export function fetchCabinet(ownerId: string, token: string | null): Promise<CabinetList> {
  return call('GET', base(ownerId), token, undefined, 'Unexpected error fetching the cabinet')
}

export function fetchCabinetItem(ownerId: string, itemId: string, token: string | null): Promise<CabinetItem> {
  return call('GET', `${base(ownerId)}/${itemId}`, token, undefined, 'Unexpected error fetching the medicine')
}

export function createCabinetItem(ownerId: string, input: CabinetInput, token: string | null): Promise<CabinetItem> {
  return call('POST', base(ownerId), token, input, 'Unexpected error adding the medicine')
}

export function updateCabinetItem(ownerId: string, itemId: string, input: CabinetInput, token: string | null): Promise<CabinetItem> {
  return call('PUT', `${base(ownerId)}/${itemId}`, token, input, 'Unexpected error editing the medicine')
}

export function deleteCabinetItem(ownerId: string, itemId: string, token: string | null): Promise<void> {
  return call('DELETE', `${base(ownerId)}/${itemId}`, token, undefined, 'Unexpected error removing the medicine')
}

export function fetchCabinetPhoto(ownerId: string, itemId: string, token: string | null): Promise<{ photoBase64: string }> {
  return call('GET', `${base(ownerId)}/${itemId}/photo`, token, undefined, 'Unexpected error fetching the photo')
}
