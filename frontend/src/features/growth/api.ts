import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { GrowthChart, GrowthList, Measurement, MeasurementInput, ReferenceSex } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** The errors of the growth routes. The values and the note only ever travel in bodies. */
export class GrowthApiError extends ApiError<'plan_required' | 'limit' | 'validation_error' | 'not_found' | 'forbidden' | 'unknown'> {}

interface ErrorBody {
  error?: string
  message?: string
  details?: ValidationErrorDetail[]
}

function errorFor(status: number, body: ErrorBody, fallback: string): GrowthApiError {
  const message = body.message ?? fallback
  if (status === 403) return new GrowthApiError('forbidden', message)
  if (status === 404) return new GrowthApiError('not_found', message)
  if (status === 400 && body.error === 'validation_error') return new GrowthApiError('validation_error', message, body.details)
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded') return new GrowthApiError('plan_required', message)
  if (status === 422 && body.error === 'growth_limit_exceeded') return new GrowthApiError('limit', message)
  return new GrowthApiError('unknown', message)
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

const base = (childId: string) => `/children/${childId}/growth-measurements`

export function fetchGrowth(childId: string, token: string | null): Promise<GrowthList> {
  return call('GET', base(childId), token, undefined, 'Unexpected error fetching the measurements')
}

export function createMeasurement(childId: string, input: MeasurementInput, token: string | null): Promise<Measurement> {
  return call('POST', base(childId), token, input, 'Unexpected error writing the measurement')
}

export function updateMeasurement(childId: string, id: string, input: MeasurementInput, token: string | null): Promise<Measurement> {
  return call('PUT', `${base(childId)}/${id}`, token, input, 'Unexpected error correcting the measurement')
}

export function deleteMeasurement(childId: string, id: string, token: string | null): Promise<void> {
  return call('DELETE', `${base(childId)}/${id}`, token, undefined, 'Unexpected error removing the measurement')
}

export function setReferenceSex(childId: string, sex: ReferenceSex, token: string | null): Promise<void> {
  return call('PUT', `/children/${childId}/growth-reference`, token, { sex }, 'Unexpected error saving the WHO table')
}

export function fetchGrowthChart(childId: string, token: string | null): Promise<GrowthChart> {
  return call('GET', `/children/${childId}/growth-chart`, token, undefined, 'Unexpected error fetching the chart')
}
