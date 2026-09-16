import { useMutation } from '@tanstack/react-query'
import { createAccount, type CreateAccountPayload } from './api'

/**
 * Wraps the POST /accounts mutation. Deliberately does NOT reset or clear
 * any form state on error — React Hook Form owns the field values, and this
 * hook only reports success/error so the caller's form data stays intact
 * (FR-007, SC-002: no data loss on validation or freemium-limit errors).
 */
export function useAccountSignup() {
  return useMutation({
    mutationFn: (payload: CreateAccountPayload) => createAccount(payload),
  })
}
