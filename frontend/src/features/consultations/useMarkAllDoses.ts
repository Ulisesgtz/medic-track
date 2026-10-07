import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { updateDoseStatus } from './api'
import { updateRoutineDose } from '../supplements/api'
import type { OverviewDose } from './types'

/**
 * "Marcar tomas" (mock 02): marks every given dose as taken in one go and
 * refreshes the overview plus each consultation those doses belong to.
 */
export function useMarkAllDoses() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (doses: Pick<OverviewDose, 'id' | 'consultationId' | 'kind' | 'routineId'>[]) => {
      const token = await getToken()
      return Promise.all(
        doses.map((dose) =>
          dose.kind === 'supplement' && dose.routineId
            ? updateRoutineDose(dose.routineId, dose.id, true, token)
            : updateDoseStatus(dose.consultationId, dose.id, true, token),
        ),
      )
    },
    onSuccess: (_result, doses) => {
      queryClient.invalidateQueries({ queryKey: ['overview'] })
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      queryClient.invalidateQueries({ queryKey: ['routine'] })
      for (const consultationId of new Set(doses.filter((d) => d.kind !== 'supplement').map((d) => d.consultationId))) {
        queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
      }
    },
  })
}
