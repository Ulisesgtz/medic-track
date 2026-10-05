import { ApiError } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { Account } from '../home/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** Discriminated error of the reminder endpoints (specs/011, contracts/reminders-api.md). */
export class RemindersApiError extends ApiError<'validation_error' | 'not_found' | 'unavailable' | 'unknown'> {}

export type ReminderDetail = 'detailed' | 'generic'

export interface ReminderConfig {
  available: boolean
  vapidPublicKey: string | null
}

async function readBody(res: Response): Promise<{ message?: string; details?: unknown }> {
  return res.json().catch(() => ({}))
}

async function fail(res: Response, fallback: string): Promise<never> {
  const body = await readBody(res)
  const message = body.message ?? fallback
  if (res.status === 400) throw new RemindersApiError('validation_error', message)
  if (res.status === 403 || res.status === 404) throw new RemindersApiError('not_found', message)
  if (res.status === 503) throw new RemindersApiError('unavailable', message)
  throw new RemindersApiError('unknown', message)
}

export async function fetchReminderConfig(token: string | null): Promise<ReminderConfig> {
  const res = await fetch(`${API_BASE_URL}/reminders/config`, { headers: withAuthHeader(token) })
  if (!res.ok) return fail(res, 'Could not load the reminder configuration')
  return res.json()
}

/** Turns reminders on for this browser (its PushSubscription, `toJSON()`). */
export async function registerDevice(accountId: string, subscription: PushSubscriptionJSON, token: string | null): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/reminder-devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys }),
  })
  if (!res.ok) return fail(res, 'Could not turn reminders on')
}

/** Turns reminders off for this browser. */
export async function removeDevice(accountId: string, endpoint: string, token: string | null): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/reminder-devices/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok) return fail(res, 'Could not turn reminders off')
}

/** What the account's reminders show; returns the whole account. */
export async function updateReminderDetail(accountId: string, detail: ReminderDetail, token: string | null): Promise<Account> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/reminder-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ reminderDetail: detail }),
  })
  if (!res.ok) return fail(res, 'Could not update the reminder settings')
  return res.json()
}
