import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import { AccountApiError } from '../home/api'
import type { FirstUseGuideState } from '../home/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// specs/071-primer-uso-guiado/contracts/first-use-guide.md: closes («Ahora no») or reopens the guide of the home.
export async function setFirstUseGuide(accountId: string, dismissed: boolean, token: string | null): Promise<FirstUseGuideState> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/first-use-guide`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ dismissed }),
  })
  const body = await res.json().catch(() => ({}))

  if (res.ok) {
    return body as FirstUseGuideState
  }
  if (res.status === 404 || res.status === 403) {
    throw new AccountApiError('not_found', body.message ?? 'Account not found')
  }
  if (res.status === 400) {
    throw new AccountApiError('validation_error', body.message ?? 'Validation error', body.details)
  }
  throw new AccountApiError('unknown', body.message ?? 'Unexpected error saving the guide')
}
