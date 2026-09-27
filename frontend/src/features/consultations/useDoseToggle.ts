import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { updateDoseStatus } from './api'

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
