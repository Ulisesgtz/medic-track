import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { updateChild, type ChildCorrection } from './api'

/**
 * Corrects the child (specs/064). Every screen that names the child reads it from the account, so the account is asked again; the
 * growth record too, because a new birth date changes the age of each measurement and the form may have written one down.
 */
export function useUpdateChild(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ChildCorrection) => updateChild(childId, body, await getToken()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['growth', childId] })
      void queryClient.invalidateQueries({ queryKey: ['growth-chart', childId] })
    },
  })
}
