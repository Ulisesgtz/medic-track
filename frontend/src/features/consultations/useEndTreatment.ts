import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { endTreatment } from './api'

/**
 * Ends one medication's treatment early (specs/016) and refreshes what shows it: the consultation detail (its doses
 * turn canceled) and the child's overview ("Tomas de hoy" and the active treatment).
 */
export function useEndTreatment(consultationId: string, medicationId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => endTreatment(consultationId, medicationId, await getToken()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}
