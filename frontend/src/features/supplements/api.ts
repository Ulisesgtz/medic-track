import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { PersonalRoutineList, RoutineDose, Routine, RoutineInput, RoutineKind, RoutineList } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type { ValidationErrorDetail }

/** Discriminated error thrown by this feature's api functions. */
export class SupplementApiError extends ApiError<
  | 'child_not_found'
  | 'account_not_found'
  | 'routine_not_found'
  | 'dose_not_found'
  | 'forbidden'
  | 'validation_error'
  /** The free plan: creating, editing and resuming routines are the paid plan's (422 `reason: "supplements"`). */
  | 'plan_required'
  /** The child already has the maximum of active routines (422). */
  | 'routine_limit'
  | 'routine_ended'
  | 'routine_not_active'
  /** «Realizado» found no dose left to mark in that day (409). */
  | 'nothing_to_mark'
  | 'unknown'
> {
  /** For `routine_limit`: the maximum the server says. */
  limit?: number
}

interface ErrorBody {
  error?: string
  message?: string
  reason?: string
  limit?: number
  details?: ValidationErrorDetail[]
}

function errorFor(status: number, body: ErrorBody, fallback: string): SupplementApiError {
  const message = body.message ?? fallback
  if (status === 403) return new SupplementApiError('forbidden', message)
  if (status === 404) {
    if (body.error === 'dose_not_found') return new SupplementApiError('dose_not_found', message)
    if (body.error === 'child_not_found') return new SupplementApiError('child_not_found', message)
    if (body.error === 'account_not_found') return new SupplementApiError('account_not_found', message)
    return new SupplementApiError('routine_not_found', message)
  }
  if (status === 400 && body.error === 'validation_error') return new SupplementApiError('validation_error', message, body.details)
  if (status === 409 && body.error === 'routine_ended') return new SupplementApiError('routine_ended', message)
  if (status === 409 && body.error === 'nothing_to_mark') return new SupplementApiError('nothing_to_mark', message)
  if (status === 409 && body.error === 'routine_not_active') return new SupplementApiError('routine_not_active', message)
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded' && body.reason === 'supplements') {
    return new SupplementApiError('plan_required', message)
  }
  if (status === 422 && body.error === 'routine_limit_exceeded') {
    const err = new SupplementApiError('routine_limit', message)
    err.limit = body.limit
    return err
  }
  return new SupplementApiError('unknown', message)
}

/**
 * One call to the routines API. What the parent wrote (name, note) only ever travels in the JSON body, never in the
 * address (specs/033, Principio II).
 */
async function call<T>(method: string, path: string, token: string | null, body?: unknown, fallback = 'Unexpected error'): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...withAuthHeader(token) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  // 204: nothing to read (the personal notice's «Entendido»).
  const json = res.status === 204 ? undefined : await res.json()
  if (res.ok) return json as T
  throw errorFor(res.status, json ?? {}, fallback)
}

const windowQuery = (from: Date, to: Date) => new URLSearchParams({ from: from.toISOString(), to: to.toISOString() }).toString()

const kindQuery = (from: Date, to: Date, kind: RoutineKind) => `${windowQuery(from, to)}&kind=${kind}`

/** GET /children/{id}/routines: the child's supplements or activities with only the doses of [from, to) (the local day). */
export function fetchRoutines(childId: string, kind: RoutineKind, from: Date, to: Date, token: string | null): Promise<RoutineList> {
  return call('GET', `/children/${childId}/routines?${kindQuery(from, to, kind)}`, token, undefined, 'Unexpected error fetching the routines')
}

/** GET /routines/{id}: one routine with the doses of [from, to) (a month of the calendar). */
export function fetchRoutine(routineId: string, from: Date, to: Date, token: string | null): Promise<Routine> {
  return call('GET', `/routines/${routineId}?${windowQuery(from, to)}`, token, undefined, 'Unexpected error fetching the routine')
}

export function createRoutine(childId: string, input: RoutineInput, token: string | null): Promise<Routine> {
  return call('POST', `/children/${childId}/routines`, token, input, 'Unexpected error creating the routine')
}

export function updateRoutine(routineId: string, input: RoutineInput, token: string | null): Promise<Routine> {
  return call('PATCH', `/routines/${routineId}`, token, input, 'Unexpected error updating the routine')
}

export function pauseRoutine(routineId: string, token: string | null): Promise<Routine> {
  return call('POST', `/routines/${routineId}/pause`, token, undefined, 'Unexpected error pausing the routine')
}

export function resumeRoutine(routineId: string, utcOffsetMinutes: number, token: string | null): Promise<Routine> {
  return call('POST', `/routines/${routineId}/resume`, token, { utcOffsetMinutes }, 'Unexpected error resuming the routine')
}

export function finishRoutine(routineId: string, token: string | null): Promise<Routine> {
  return call('POST', `/routines/${routineId}/finish`, token, undefined, 'Unexpected error finishing the routine')
}

/** PUT /routines/{id}/my-reminders: the session's own reminders of the routine, on or off. */
export function setMyReminders(routineId: string, enabled: boolean, token: string | null): Promise<{ myReminders: boolean }> {
  return call('PUT', `/routines/${routineId}/my-reminders`, token, { enabled }, 'Unexpected error saving the reminder choice')
}

/** PATCH /routines/{id}/doses/{doseId}: mark or unmark a dose (the first mark wins; it never depends on the plan). */
export function updateRoutineDose(routineId: string, doseId: string, taken: boolean, token: string | null): Promise<RoutineDose> {
  return call('PATCH', `/routines/${routineId}/doses/${doseId}`, token, { taken }, 'Unexpected error updating the dose')
}

/** GET /accounts/{id}/routines: the person's OWN supplements or activities (no child) with only the doses of [from, to) (the local day). */
export function fetchPersonalRoutines(accountId: string, kind: RoutineKind, from: Date, to: Date, token: string | null): Promise<PersonalRoutineList> {
  return call('GET', `/accounts/${accountId}/routines?${kindQuery(from, to, kind)}`, token, undefined, 'Unexpected error fetching the routines')
}

/**
 * POST /routines/{id}/done: «Realizado» on an activity. The server marks the earliest unmarked dose of [from, to) (the local day)
 * as the session, also one that hasn't come yet; it never depends on the plan.
 */
export function markRoutineDone(routineId: string, from: Date, to: Date, token: string | null): Promise<RoutineDose> {
  return call('POST', `/routines/${routineId}/done`, token, { from: from.toISOString(), to: to.toISOString() }, 'Unexpected error marking the activity')
}

/** POST /accounts/{id}/routines: a routine for the person themselves; nobody else in the family sees it. */
export function createPersonalRoutine(accountId: string, input: RoutineInput, token: string | null): Promise<Routine> {
  return call('POST', `/accounts/${accountId}/routines`, token, input, 'Unexpected error creating the routine')
}

/** POST /accounts/{id}/routines/notice-seen: «Entendido» on the first-time notice (kept for the account, every device). */
export function acknowledgePersonalNotice(accountId: string, token: string | null): Promise<void> {
  return call('POST', `/accounts/${accountId}/routines/notice-seen`, token, undefined, 'Unexpected error saving the notice')
}
