import { useAuth } from '@clerk/react'
import { useMutation } from '@tanstack/react-query'
import { createDeviceLink } from './parentApi'

/** Makes the one-use link of a child's phone. */
export function useCreateDeviceLink(childId: string) {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async (name: string) => createDeviceLink(childId, name, await getToken()),
  })
}
