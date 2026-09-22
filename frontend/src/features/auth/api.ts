import { ApiError } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { Account } from '../home/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** Discriminated error thrown by fetchMe so callers can branch on `kind`. */
export class MeApiError extends ApiError<'not_found_for_session' | 'unknown'> {}

// contracts/get-accounts-me.md
export async function fetchMe(token: string | null): Promise<Account> {
  const res = await fetch(`${API_BASE_URL}/accounts/me`, {
    headers: withAuthHeader(token),
  })
  const body = await res.json()

  if (res.ok) {
    return body as Account
  }
  if (res.status === 404) {
    throw new MeApiError('not_found_for_session', body.message ?? 'No account is linked to this session yet')
  }
  throw new MeApiError('unknown', body.message ?? 'Unexpected error fetching the current account')
}
