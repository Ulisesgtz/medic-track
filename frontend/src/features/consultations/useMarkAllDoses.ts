import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDoseStatus } from './api'
import type { OverviewDose } from './types'

/**
 * "Marcar tomas" (mock 02): marks every given dose as taken in one go and
 * refreshes the overview plus each consultation those doses belong to.
 */
export function useMarkAllDoses() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (doses: Pick<OverviewDose, 'id' | 'consultationId'>[]) =>
      Promise.all(doses.map((dose) => updateDoseStatus(dose.consultationId, dose.id, true))),
    onSuccess: (_result, doses) => {
      queryClient.invalidateQueries({ queryKey: ['overview'] })
      for (const consultationId of new Set(doses.map((d) => d.consultationId))) {
        queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
      }
    },
  })
}
