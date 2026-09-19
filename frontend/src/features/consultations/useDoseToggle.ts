import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDoseStatus } from './api'

/**
 * Marks or unmarks one dose (FR-011/FR-016 of specs/004) and refreshes every
 * screen that shows it: the consultation detail and the child's "Tomas de
 * hoy" overview. Shared by the detail's `DoseCheckbox` and the overview's
 * panel so a change to how doses are toggled happens in one place.
 */
export function useDoseToggle(consultationId: string, doseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taken: boolean) => updateDoseStatus(consultationId, doseId, taken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}
