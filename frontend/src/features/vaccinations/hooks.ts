import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVaccination,
  deletePhoto,
  deleteVaccination,
  fetchPhoto,
  fetchPhotos,
  fetchVaccinations,
  updateVaccination,
  uploadPhoto,
} from './api'
import type { VaccinationInput } from './types'

export const vaccinationsKey = (childId: string | undefined) => ['vaccinations', childId] as const
export const photosKey = (childId: string | undefined) => ['vaccine-photos', childId] as const

/** The child's recorded doses. */
export function useVaccinations(childId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: vaccinationsKey(childId),
    queryFn: async () => (await fetchVaccinations(childId!, await getToken())).vaccinations,
    enabled: !!childId,
    retry: false,
  })
}

/** Records a dose, or corrects the one with `id` (the whole dose is sent). */
export function useSaveVaccination(childId: string, id?: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: VaccinationInput) =>
      id ? updateVaccination(childId, id, input, await getToken()) : createVaccination(childId, input, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vaccinationsKey(childId) }),
  })
}

export function useDeleteVaccination(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => deleteVaccination(childId, id, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vaccinationsKey(childId) }),
  })
}

/** Who saved each photo of the card and when (never the images). */
export function usePhotos(childId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: photosKey(childId),
    queryFn: async () => fetchPhotos(childId!, await getToken()),
    enabled: !!childId,
    retry: false,
  })
}

/** The image of one photo, asked for only when it is opened. */
export function usePhoto(childId: string | undefined, id: string | null) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: [...photosKey(childId), id],
    queryFn: async () => fetchPhoto(childId!, id!, await getToken()),
    enabled: !!childId && !!id,
    retry: false,
    staleTime: Infinity,
  })
}

export function useUploadPhoto(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (photoBase64: string) => uploadPhoto(childId, photoBase64, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey(childId) }),
  })
}

export function useDeletePhoto(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => deletePhoto(childId, id, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey(childId) }),
  })
}
