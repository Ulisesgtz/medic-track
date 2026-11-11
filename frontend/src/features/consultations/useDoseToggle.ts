import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { formatTime } from '../../shared/date'
import { requestMark } from '../../shared/marks/requestMark'
import { updateDoseStatus } from './api'
import { updateRoutineDose } from '../supplements/api'
import type { OverviewDose } from './types'

/** What a screen gets to mark a dose: the tap shows at once (specs/066), so nothing waits and nothing is «pending» to disable. */
export interface MarkToggle {
  mutate: (taken: boolean, options?: { onSuccess?: () => void }) => void
  isPending: false
}

/**
 * Marks or unmarks one dose (FR-011/FR-016 of specs/004) and refreshes every
 * screen that shows it: the consultation detail and the child's "Tomas de
 * hoy" overview. Shared by the detail's `DoseRow` and the overview's
 * panel so a change to how doses are toggled happens in one place. Since specs/066 the
 * mark shows at once (`requestMark`) and goes back, with a notice, if the server didn't save it.
 */
export function useDoseToggle(consultationId: string, doseId: string, label: { name?: string; scheduledAt?: string } = {}): MarkToggle {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return {
    isPending: false,
    mutate: (taken, options) =>
      void requestMark({
        queryClient,
        dose: { id: doseId, name: label.name ?? '', time: label.scheduledAt ? formatTime(label.scheduledAt) : '' },
        taken,
        send: async (wanted) => updateDoseStatus(consultationId, doseId, wanted, await getToken()),
        invalidate: () => {
          void queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
          void queryClient.invalidateQueries({ queryKey: ['overview'] })
        },
        onSaved: options?.onSuccess,
      }),
  }
}

/**
 * The same toggle for a dose of today's list (the child's overview), whichever it is: a medication's goes to its
 * consultation, a supplement routine's (specs/033, `kind: "supplement"`) to its routine. Both refresh every screen that shows doses.
 */
export function useOverviewDoseToggle(dose: Pick<OverviewDose, 'id' | 'kind' | 'routineId' | 'consultationId'> & Partial<Pick<OverviewDose, 'medicationName' | 'scheduledAt'>>): MarkToggle {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return {
    isPending: false,
    mutate: (taken, options) =>
      void requestMark({
        queryClient,
        dose: { id: dose.id, name: dose.medicationName ?? '', time: dose.scheduledAt ? formatTime(dose.scheduledAt) : '' },
        taken,
        send: async (wanted) => {
          const token = await getToken()
          return dose.kind === 'supplement' && dose.routineId
            ? updateRoutineDose(dose.routineId, dose.id, wanted, token)
            : updateDoseStatus(dose.consultationId, dose.id, wanted, token)
        },
        invalidate: () => {
          void queryClient.invalidateQueries({ queryKey: ['consultation', dose.consultationId] })
          void queryClient.invalidateQueries({ queryKey: ['routines'] })
          void queryClient.invalidateQueries({ queryKey: ['routine'] })
          void queryClient.invalidateQueries({ queryKey: ['overview'] })
        },
        onSaved: options?.onSuccess,
      }),
  }
}
