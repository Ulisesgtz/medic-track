import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export interface CreateChildPayload {
  firstName: string
  lastName: string
  birthDate: string
  height?: number
  weight?: number
}

export interface CreateAccountPayload {
  firstName: string
  lastName: string
  email: string
  countryCode?: string
  stateCode?: string
  children: CreateChildPayload[]
}

export interface CreateAccountResponse {
  id: string
  firstName: string
  lastName: string
  email: string
  countryCode: string | null
  stateCode: string | null
  plan: string
  children: Array<CreateChildPayload & { id: string }>
}

export type { ValidationErrorDetail }

/** Discriminated error thrown by createAccount so callers can branch on `kind`. */
export class CreateAccountError extends ApiError<
  'validation_error' | 'email_already_exists' | 'freemium_child_limit_exceeded' | 'unknown'
> {}

export async function createAccount(
  payload: CreateAccountPayload,
): Promise<CreateAccountResponse> {
  const res = await fetch(`${API_BASE_URL}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body = await res.json()

  if (res.ok) {
    return body as CreateAccountResponse
  }

  if (res.status === 400) {
    throw new CreateAccountError('validation_error', body.message ?? 'Validation error', body.details)
  }
  if (res.status === 409) {
    throw new CreateAccountError('email_already_exists', body.message ?? 'Email already in use')
  }
  if (res.status === 422) {
    throw new CreateAccountError(
      'freemium_child_limit_exceeded',
      body.message ?? 'Free plan limit exceeded',
    )
  }
  throw new CreateAccountError('unknown', body.message ?? 'Unexpected error creating account')
}
