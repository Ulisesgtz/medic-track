import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import type { Account } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type { ValidationErrorDetail }

/** Discriminated error thrown by fetchAccount/addChild so callers can branch on `kind`. */
export class AccountApiError extends ApiError<
  'not_found' | 'validation_error' | 'freemium_child_limit_exceeded' | 'unknown'
> {}

// contracts/get-account.md
export async function fetchAccount(accountId: string): Promise<Account> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}`)
  const body = await res.json()

  if (res.ok) {
    return body as Account
  }
  if (res.status === 404) {
    throw new AccountApiError('not_found', body.message ?? 'Account not found')
  }
  throw new AccountApiError('unknown', body.message ?? 'Unexpected error fetching account')
}

export interface AddChildPayload {
  firstName: string
  lastName: string
  birthDate: string
  height?: number
  weight?: number
}

// contracts/post-account-children.md
export async function addChild(accountId: string, payload: AddChildPayload): Promise<Account> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json()

  if (res.ok) {
    return body as Account
  }
  if (res.status === 404) {
    throw new AccountApiError('not_found', body.message ?? 'Account not found')
  }
  if (res.status === 400) {
    throw new AccountApiError('validation_error', body.message ?? 'Validation error', body.details)
  }
  if (res.status === 422) {
    throw new AccountApiError(
      'freemium_child_limit_exceeded',
      body.message ?? 'Free plan limit exceeded',
    )
  }
  throw new AccountApiError('unknown', body.message ?? 'Unexpected error adding child')
}
