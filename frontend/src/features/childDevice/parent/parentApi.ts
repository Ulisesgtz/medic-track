import { ApiError } from '../../../shared/apiError'
import { withAuthHeader } from '../../../shared/auth/withAuthHeader'

// The parents' side of the child's phone (specs/047): with the parent's own Clerk session (`Bearer`). The child's phone has its own
// client in ../phone and the two never import each other.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type DeviceLinkErrorKind = 'validation_error' | 'plan_required' | 'limit' | 'forbidden' | 'not_found' | 'unknown'

export class DeviceLinkError extends ApiError<DeviceLinkErrorKind> {
  limit?: number
}

export interface CreatedLink {
  id: string
  name: string
  status: 'pending'
  /** The link's secret: only in this answer. */
  token: string
  expiresAt: string
}

interface ErrorBody {
  error?: string
  reason?: string
  message?: string
  limit?: number
}

function toError(status: number, body: ErrorBody): DeviceLinkError {
  const message = body.message ?? 'Unexpected error'
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded' && body.reason === 'child_device') return new DeviceLinkError('plan_required', message)
  if (status === 422 && body.error === 'child_device_limit_exceeded') {
    const error = new DeviceLinkError('limit', message)
    error.limit = body.limit
    return error
  }
  if (status === 400 && body.error === 'validation_error') return new DeviceLinkError('validation_error', message)
  if (status === 403) return new DeviceLinkError('forbidden', message)
  if (status === 404) return new DeviceLinkError('not_found', message)
  return new DeviceLinkError('unknown', message)
}

/** POST /children/{id}/device-links: the phone's name only travels in the body, never in an address. */
export async function createDeviceLink(childId: string, name: string, token: string | null): Promise<CreatedLink> {
  const res = await fetch(`${API_BASE_URL}/children/${childId}/device-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ name }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw toError(res.status, json)
  return json as CreatedLink
}

/** The link a phone opens: the secret goes in the `#`, which a browser never sends to a server. */
export function deviceLinkUrl(origin: string, token: string): string {
  return `${origin}/hijo#${token}`
}
