import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { extendTreatment } from './api'

/**
 * Adds doses to the end of one medication (specs/020) and refreshes what shows them: the consultation detail (the new
 * doses, the calendar, the progress) and the child's overview ("Tomas de hoy" and the active treatment). A refusal
 * because it was already done (another tap, another device) refreshes too: what the parent sees catches up.
 */
export function useExtendTreatment(consultationId: string, medicationId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
    queryClient.invalidateQueries({ queryKey: ['overview'] })
  }
  return useMutation({
    mutationFn: async (doses: number) => extendTreatment(consultationId, medicationId, doses, await getToken()),
    onSuccess: refresh,
    onError: refresh,
  })
}
