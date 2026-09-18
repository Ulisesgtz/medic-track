import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDoseStatus } from './api'
import type { Dose } from './types'

interface DoseCheckboxProps {
  consultationId: string
  dose: Dose
}

/**
 * One markable dose (FR-011). Can be toggled at any time, regardless of
 * whether its scheduled date already passed or the treatment already ended
 * (FR-016) — there is no "active treatment" concept anywhere in this UI.
 */
export function DoseCheckbox({ consultationId, dose }: DoseCheckboxProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (taken: boolean) => updateDoseStatus(consultationId, dose.id, taken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] })
    },
  })

  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={dose.taken}
        onChange={(e) => mutation.mutate(e.target.checked)}
        disabled={mutation.isPending}
        className="h-4 w-4 cursor-pointer"
      />
      <span className="text-slate-700">{new Date(dose.scheduledAt).toLocaleString()}</span>
    </label>
  )
}
