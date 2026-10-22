import { ApiError } from '../../../shared/apiError'

// The child's phone talks to the API with its own credential: `Authorization: Device <credential>` — never `Bearer`, and never a
// Clerk token (specs/047). This file imports nothing from the parents' side; `isolation.test.ts` keeps it so.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type PhoneErrorKind = 'no_access' | 'unknown'

export class PhoneApiError extends ApiError<PhoneErrorKind> {}

export interface Redeemed {
  credential: string
  childId: string
  childFirstName: string
  rotateAfter: string
}

export interface Me {
  childId: string
  childFirstName: string
  deviceName: string
  rotateAfter: string
  reminderDetail: 'generic' | 'detailed'
}

/** POST /child-device/redeem: the link's secret goes in the BODY, never in an address. Any failure is «no access»: the server says nothing more. */
export async function redeemLink(token: string): Promise<Redeemed> {
  const res = await fetch(`${API_BASE_URL}/child-device/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new PhoneApiError('no_access', 'This link no longer works')
  return (await res.json()) as Redeemed
}

/** A call with the phone's credential. 401 and 403 mean the access is gone (the caller clears the credential). */
export async function deviceRequest<T>(credential: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Device ${credential}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (res.status === 401 || res.status === 403) throw new PhoneApiError('no_access', 'This access is not active')
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new PhoneApiError('unknown', (json as { message?: string }).message ?? 'Unexpected error')
  return json as T
}

export const fetchMe = (credential: string) => deviceRequest<Me>(credential, '/child-device/me')
