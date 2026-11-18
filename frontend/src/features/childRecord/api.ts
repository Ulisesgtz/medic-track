import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { ChildRecord, ChildRecordInput } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** The errors of the record's API. `conflict` carries the record somebody else saved meanwhile (409 `record_conflict`). */
export class ChildRecordApiError extends ApiError<'validation_error' | 'conflict' | 'forbidden' | 'not_found' | 'unknown'> {
  current?: ChildRecord
}

interface ErrorBody {
  error?: string
  message?: string
  details?: ValidationErrorDetail[]
  current?: ChildRecord
}

export function errorFor(status: number, body: ErrorBody, fallback: string): ChildRecordApiError {
  const message = body.message ?? fallback
  if (status === 400 && body.error === 'validation_error') return new ChildRecordApiError('validation_error', message, body.details)
  if (status === 409 && body.error === 'record_conflict') {
    const e = new ChildRecordApiError('conflict', message)
    e.current = body.current
    return e
  }
  if (status === 403) return new ChildRecordApiError('forbidden', message)
  if (status === 404) return new ChildRecordApiError('not_found', message)
  return new ChildRecordApiError('unknown', message)
}

/** What a person wrote only ever travels in the body, never in an address (Principio II). */
async function call(method: 'GET' | 'PUT', childId: string, token: string | null, body?: ChildRecordInput): Promise<ChildRecord> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}/record`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...withAuthHeader(token) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (res.ok) return json as ChildRecord
  throw errorFor(res.status, json as ErrorBody, method === 'GET' ? 'Unexpected error fetching the record' : 'Unexpected error saving the record')
}

/** GET /children/{childId}/record */
export const fetchChildRecord = (childId: string, token: string | null) => call('GET', childId, token)

/** PUT /children/{childId}/record: the whole record, with the version it was edited from. */
export const saveChildRecord = (childId: string, input: ChildRecordInput, token: string | null) => call('PUT', childId, token, input)
