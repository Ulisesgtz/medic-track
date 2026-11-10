import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { Child } from '../home/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** The child as the form sends it (specs/064): the whole child; null empties the height or the weight. */
export interface ChildCorrection {
  firstName: string
  lastName: string
  birthDate: string
  height: number | null
  weight: number | null
  /** «Anotarlo también como medida de hoy»: a growth measurement on that date with the non-empty height and weight. */
  measurement: { measuredOn: string } | null
}

/** A new birth date after records already written down: how many and on which dates (YYYY-MM-DD, ascending). */
export interface BirthDateConflict {
  measurementCount: number
  measurements: string[]
  vaccinationCount: number
  vaccinations: string[]
}

type Kind = 'validation_error' | 'birth_date_conflict' | 'plan_required' | 'limit' | 'forbidden' | 'not_found' | 'unknown'

/** The errors of PUT /children/{childId}. The names and the values only ever travel in the body. */
export class ChildProfileApiError extends ApiError<Kind> {
  conflict?: BirthDateConflict
}

interface ErrorBody extends Partial<BirthDateConflict> {
  error?: string
  message?: string
  details?: ValidationErrorDetail[]
}

export function errorFor(status: number, body: ErrorBody): ChildProfileApiError {
  const message = body.message ?? 'Unexpected error correcting the child'
  if (status === 400 && body.error === 'validation_error') return new ChildProfileApiError('validation_error', message, body.details)
  if (status === 409 && body.error === 'birth_date_conflict') {
    const e = new ChildProfileApiError('birth_date_conflict', message)
    e.conflict = {
      measurementCount: body.measurementCount ?? 0,
      measurements: body.measurements ?? [],
      vaccinationCount: body.vaccinationCount ?? 0,
      vaccinations: body.vaccinations ?? [],
    }
    return e
  }
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded') return new ChildProfileApiError('plan_required', message)
  if (status === 422 && body.error === 'growth_limit_exceeded') return new ChildProfileApiError('limit', message)
  if (status === 403) return new ChildProfileApiError('forbidden', message)
  if (status === 404) return new ChildProfileApiError('not_found', message)
  return new ChildProfileApiError('unknown', message)
}

export async function updateChild(childId: string, body: ChildCorrection, token: string | null): Promise<Child> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (res.ok) return json as Child
  throw errorFor(res.status, json as ErrorBody)
}
