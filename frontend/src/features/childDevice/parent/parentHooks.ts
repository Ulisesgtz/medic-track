import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDeviceLink, fetchDeviceLinks, revokeDeviceLink, setReminderDetail } from './parentApi'

export const deviceLinksKey = (childId: string) => ['device-links', childId] as const

/** Makes the one-use link of a child's phone. */
export function useCreateDeviceLink(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => createDeviceLink(childId, name, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceLinksKey(childId) }),
  })
}

/** The child's phones and links (a minute fresh, so «last used» and the states keep up). */
export function useDeviceLinks(childId: string) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: deviceLinksKey(childId),
    queryFn: async () => fetchDeviceLinks(childId, await getToken()),
    retry: false,
    refetchInterval: 60_000,
  })
}

/** Removes a phone at once. */
export function useRevokeDeviceLink(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (linkId: string) => revokeDeviceLink(childId, linkId, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceLinksKey(childId) }),
  })
}

/** Chooses what a phone's reminders say. */
export function useSetReminderDetail(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ linkId, detail }: { linkId: string; detail: 'generic' | 'detailed' }) => setReminderDetail(childId, linkId, detail, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceLinksKey(childId) }),
  })
}
