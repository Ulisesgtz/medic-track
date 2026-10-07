import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { updateDoseStatus } from './api'
import { updateRoutineDose } from '../supplements/api'
import type { OverviewDose } from './types'

/**
 * Marks or unmarks one dose (FR-011/FR-016 of specs/004) and refreshes every
 * screen that shows it: the consultation detail and the child's "Tomas de
 * hoy" overview. Shared by the detail's `DoseCheckbox` and the overview's
 * panel so a change to how doses are toggled happens in one place.
 */
export function useDoseToggle(consultationId: string, doseId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (taken: boolean) => updateDoseStatus(consultationId, doseId, taken, await getToken()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

/**
 * The same toggle for a dose of today's list (the child's overview), whichever it is: a medication's goes to its
 * consultation, a supplement routine's (specs/033, `kind: "supplement"`) to its routine. Both refresh every screen that shows doses.
 */
export function useOverviewDoseToggle(dose: Pick<OverviewDose, 'id' | 'kind' | 'routineId' | 'consultationId'>) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (taken: boolean) => {
      const token = await getToken()
      return dose.kind === 'supplement' && dose.routineId
        ? updateRoutineDose(dose.routineId, dose.id, taken, token)
        : updateDoseStatus(dose.consultationId, dose.id, taken, token)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', dose.consultationId] })
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      queryClient.invalidateQueries({ queryKey: ['routine'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}
