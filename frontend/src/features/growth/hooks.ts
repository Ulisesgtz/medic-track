import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { createMeasurement, deleteMeasurement, fetchGrowth, fetchGrowthChart, setReferenceSex, updateMeasurement } from './api'
import type { MeasurementInput, ReferenceSex } from './types'

export function useGrowth(childId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['growth', childId],
    queryFn: async () => fetchGrowth(childId as string, await getToken()),
    enabled: !!childId,
    retry: false,
  })
}

/** The chart is asked only when it is shown and the family has the plan (the server decides again). */
export function useGrowthChart(childId: string | undefined, enabled: boolean) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['growth-chart', childId],
    queryFn: async () => fetchGrowthChart(childId as string, await getToken()),
    enabled: enabled && !!childId,
    retry: false,
  })
}

function useRefresh(childId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['growth', childId] })
    void queryClient.invalidateQueries({ queryKey: ['growth-chart', childId] })
  }
}

export function useSaveMeasurement(childId: string, id?: string) {
  const { getToken } = useAuth()
  const refresh = useRefresh(childId)
  return useMutation({
    mutationFn: async (input: MeasurementInput) =>
      id ? updateMeasurement(childId, id, input, await getToken()) : createMeasurement(childId, input, await getToken()),
    onSuccess: refresh,
  })
}

export function useDeleteMeasurement(childId: string) {
  const { getToken } = useAuth()
  const refresh = useRefresh(childId)
  return useMutation({
    mutationFn: async (id: string) => deleteMeasurement(childId, id, await getToken()),
    onSuccess: refresh,
  })
}

export function useSetReferenceSex(childId: string) {
  const { getToken } = useAuth()
  const refresh = useRefresh(childId)
  return useMutation({
    mutationFn: async (sex: ReferenceSex) => setReferenceSex(childId, sex, await getToken()),
    onSuccess: refresh,
  })
}
