import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { useLocalDay } from '../../shared/useLocalDay'
import { fetchChildOverview } from '../consultations/api'
import { DOSE_REFETCH_MS } from '../consultations/doseStatus'
import { useRoutines } from '../supplements/hooks'
import { childDay } from './daySummary'

/**
 * One child's day on the home (specs/055, research R1): the overview (medication and supplement doses) and the activities, with
 * the same query keys as the child's detail, so a mark on either screen shows on both. Two requests per child, as the home made
 * before (it asked the consultations instead of the activities).
 */
export function useChildDay(childId: string) {
  const day = useLocalDay()
  const { getToken } = useAuth()
  const overview = useQuery({
    queryKey: ['overview', childId, day.from.toISOString()],
    queryFn: async () => fetchChildOverview(childId, day.from, day.to, await getToken()),
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  })
  const activities = useRoutines(childId, 'activity', day)

  const data = overview.data && activities.data ? childDay(overview.data, activities.data.routines) : undefined
  return {
    day: data,
    isPending: overview.isPending || activities.isPending,
    isError: overview.isError || activities.isError,
    refetch: () => {
      if (overview.isError) void overview.refetch()
      if (activities.isError) void activities.refetch()
    },
  }
}
