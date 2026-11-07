import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { createCabinetItem, deleteCabinetItem, fetchCabinet, fetchCabinetItem, fetchCabinetPhoto, updateCabinetItem } from './api'
import type { CabinetInput } from './types'

/** The family's cabinet (the owner's account id); nothing is asked until it is known. */
export function useCabinet(ownerId: string | undefined, enabled = true) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['cabinet', ownerId],
    queryFn: async () => fetchCabinet(ownerId as string, await getToken()),
    enabled: enabled && !!ownerId,
  })
}

export function useCabinetItem(ownerId: string | undefined, itemId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['cabinet-item', itemId],
    queryFn: async () => fetchCabinetItem(ownerId as string, itemId as string, await getToken()),
    enabled: !!ownerId && !!itemId,
    retry: false,
  })
}

/** A medicine's photo, asked only when it is shown (it doesn't change unless edited, which invalidates it). */
export function useCabinetPhoto(ownerId: string | undefined, itemId: string | undefined, enabled: boolean) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['cabinet-photo', itemId],
    queryFn: async () => fetchCabinetPhoto(ownerId as string, itemId as string, await getToken()),
    enabled: enabled && !!ownerId && !!itemId,
    staleTime: Infinity,
  })
}

function useRefresh() {
  const queryClient = useQueryClient()
  return (itemId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['cabinet'] })
    if (itemId) {
      queryClient.invalidateQueries({ queryKey: ['cabinet-item', itemId] })
      queryClient.invalidateQueries({ queryKey: ['cabinet-photo', itemId] })
    }
  }
}

export function useSaveCabinetItem(ownerId: string, itemId?: string) {
  const { getToken } = useAuth()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (input: CabinetInput) =>
      itemId ? updateCabinetItem(ownerId, itemId, input, await getToken()) : createCabinetItem(ownerId, input, await getToken()),
    onSuccess: (saved) => refresh(saved.id),
  })
}

export function useDeleteCabinetItem(ownerId: string, itemId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => deleteCabinetItem(ownerId, itemId, await getToken()),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['cabinet-item', itemId] })
      queryClient.removeQueries({ queryKey: ['cabinet-photo', itemId] })
      queryClient.invalidateQueries({ queryKey: ['cabinet'] })
    },
  })
}
