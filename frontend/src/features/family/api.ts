import { ApiError } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { CreatedInvitation, FamilyView, InvitationPreview, InviteRole, Membership } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type FamilyErrorKind =
  | 'validation_error'
  | 'forbidden'
  | 'plan_required'
  | 'family_full'
  | 'already_member'
  | 'invitation_pending'
  | 'invitation_not_found'
  | 'email_mismatch'
  | 'email_not_verified'
  | 'account_required'
  | 'already_in_family'
  | 'unknown'

export class FamilyApiError extends ApiError<FamilyErrorKind> {}

interface ErrorBody {
  error?: string
  reason?: string
  message?: string
  details?: { field: string; message: string }[]
}

const KIND_BY_CODE: Record<string, FamilyErrorKind> = {
  forbidden: 'forbidden',
  family_full: 'family_full',
  already_member: 'already_member',
  invitation_pending: 'invitation_pending',
  invitation_not_found: 'invitation_not_found',
  email_mismatch: 'email_mismatch',
  email_not_verified: 'email_not_verified',
  account_required: 'account_required',
  already_in_family: 'already_in_family',
}

function toError(status: number, body: ErrorBody, fallback: string): FamilyApiError {
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded' && body.reason === 'family') {
    return new FamilyApiError('plan_required', body.message ?? 'Sharing is part of the paid plan')
  }
  if (status === 400 && body.error === 'validation_error') {
    return new FamilyApiError('validation_error', body.message ?? 'Validation error', body.details)
  }
  const kind = body.error ? KIND_BY_CODE[body.error] : undefined
  return new FamilyApiError(kind ?? 'unknown', body.message ?? fallback)
}

async function request<T>(path: string, method: 'GET' | 'POST', token: string | null, payload?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...withAuthHeader(token) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (res.ok) return body as T
  throw toError(res.status, body as ErrorBody, 'Unexpected error')
}

// GET /family
export const fetchFamily = (token: string | null) => request<FamilyView>('/family', 'GET', token)

// POST /family/invitations
export const createInvitation = (email: string, role: InviteRole, token: string | null) =>
  request<CreatedInvitation>('/family/invitations', 'POST', token, { email, role })

export const resendInvitation = (invitationId: string, token: string | null) =>
  request<CreatedInvitation>(`/family/invitations/${invitationId}/resend`, 'POST', token)

export const cancelInvitation = (invitationId: string, token: string | null) =>
  request<void>(`/family/invitations/${invitationId}/cancel`, 'POST', token)

// The invitation's token only ever travels in the body, never in an address (the servers log addresses).
export const previewInvitation = (invitationToken: string, token: string | null) =>
  request<InvitationPreview>('/family/invitations/preview', 'POST', token, { token: invitationToken })

export const acceptInvitation = (invitationToken: string, token: string | null) =>
  request<Membership>('/family/invitations/accept', 'POST', token, { token: invitationToken })

export const declineInvitation = (invitationToken: string, token: string | null) =>
  request<void>('/family/invitations/decline', 'POST', token, { token: invitationToken })

/** The link a person opens to accept: the token is in the fragment, which a browser never sends to a server. */
export function invitationLink(origin: string, invitationToken: string): string {
  return `${origin}/familia/invitacion#${invitationToken}`
}
