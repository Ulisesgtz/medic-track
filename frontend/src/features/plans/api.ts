import { ApiError } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { SubscribeResult, SubscriptionState } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** Discriminated error thrown by this feature's api functions. */
export class SubscriptionApiError extends ApiError<'not_allowed' | 'unavailable' | 'provider_error' | 'not_found' | 'unknown'> {
  /** With `not_allowed`: `already_paid` or `covered_by_family`. */
  reason?: string
  /** With `covered_by_family`: the owner's first name. */
  coveredBy?: string
}

interface ErrorBody {
  error?: string
  message?: string
  reason?: string
  coveredBy?: string
}

function errorFor(status: number, body: ErrorBody, fallback: string): SubscriptionApiError {
  const message = body.message ?? fallback
  let error: SubscriptionApiError
  if (status === 409 && body.error === 'subscription_not_allowed') error = new SubscriptionApiError('not_allowed', message)
  else if (status === 503) error = new SubscriptionApiError('unavailable', message)
  else if (status === 502) error = new SubscriptionApiError('provider_error', message)
  else if (status === 404 || status === 403) error = new SubscriptionApiError('not_found', message)
  else error = new SubscriptionApiError('unknown', message)
  error.reason = body.reason
  error.coveredBy = body.coveredBy
  return error
}

/** One call to the subscription API. Nothing the person typed travels here: the ids are the only thing in an address. */
async function call<T>(method: string, path: string, token: string | null, fallback: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers: withAuthHeader(token) })
  const json = await res.json()
  if (res.ok) return json as T
  throw errorFor(res.status, json, fallback)
}

/** GET /accounts/{id}/subscription: whether the charge is available, whether this account can subscribe and the subscription's state. */
export const fetchSubscription = (accountId: string, token: string | null) =>
  call<SubscriptionState>('GET', `/accounts/${accountId}/subscription`, token, 'Unexpected error reading the subscription')

/** POST /accounts/{id}/subscription: starts the payment and returns the provider's page. */
export const startSubscription = (accountId: string, token: string | null) =>
  call<SubscribeResult>('POST', `/accounts/${accountId}/subscription`, token, 'Unexpected error starting the subscription')

/** POST /accounts/{id}/subscription/cancel: stops the renewal; answers with the new state. */
export const cancelSubscription = (accountId: string, token: string | null) =>
  call<SubscriptionState>('POST', `/accounts/${accountId}/subscription/cancel`, token, 'Unexpected error canceling the subscription')
