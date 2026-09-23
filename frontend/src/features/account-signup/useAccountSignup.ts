import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createAccount, type CreateAccountPayload } from './api'

/**
 * Wraps the POST /accounts mutation. Deliberately does NOT reset or clear
 * any form state on error — React Hook Form owns the field values, and this
 * hook only reports success/error so the caller's form data stays intact
 * (FR-007, SC-002: no data loss on validation or freemium-limit errors).
 */
export function useAccountSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, token }: { payload: CreateAccountPayload; token: string | null }) =>
      createAccount(payload, token),
    // `/accounts/me` may have cached a 404 (`Falta terminar tu registro`) before this account
    // existed: seed the real one so /home never flashes that screen.
    onSuccess: (account) => {
      queryClient.setQueryData(['accounts', 'me'], account)
    },
  })
}
