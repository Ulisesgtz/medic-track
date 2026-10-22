import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ChildOverview, OverviewDose } from '../../consultations/types'
import type { Routine, RoutineList } from '../../supplements/types'
import { deviceRequest, fetchMe, PhoneApiError, type Me } from './api'

// The queries of the child's own screen (specs/047). All of them go with the phone's credential and refresh every minute, like the
// parents' screens, so a dose that turns «sin registrar» changes by itself. None of them knows what a Clerk session is.

const REFRESH_MS = 60_000

export const phoneKey = (...parts: unknown[]) => ['child-device', ...parts] as const

/** True when a query failed because the access is gone (the phone must forget its credential and say so). */
export function accessGone(...errors: unknown[]): boolean {
  return errors.some((e) => e instanceof PhoneApiError && e.kind === 'no_access')
}

export function useMe(credential: string) {
  return useQuery({ queryKey: phoneKey('me'), queryFn: () => fetchMe(credential), retry: false, refetchInterval: REFRESH_MS * 5 })
}

const windowQuery = (from: Date, to: Date) => new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })

/** Today's doses of the child: medications and supplements. */
export function useOverview(credential: string, childId: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: phoneKey('overview', childId, from.toISOString()),
    queryFn: () => deviceRequest<ChildOverview>(credential, `/child-device/children/${childId}/overview?${windowQuery(from, to)}`),
    enabled: !!childId,
    retry: false,
    refetchInterval: REFRESH_MS,
  })
}

/** The child's activities with the doses of today. */
export function useActivities(credential: string, childId: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: phoneKey('activities', childId, from.toISOString()),
    queryFn: async () => {
      const query = windowQuery(from, to)
      query.set('kind', 'activity')
      return (await deviceRequest<RoutineList>(credential, `/child-device/children/${childId}/routines?${query}`)).routines as Routine[]
    },
    enabled: !!childId,
    retry: false,
    refetchInterval: REFRESH_MS,
  })
}

/** Marks or unmarks a dose of a medication or of a supplement. A mark is the phone's own: the server refuses to take back another's. */
export function useMarkDose(credential: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ dose, taken }: { dose: OverviewDose; taken: boolean }) => {
      const path =
        dose.kind === 'supplement' && dose.routineId
          ? `/child-device/routines/${dose.routineId}/doses/${dose.id}`
          : `/child-device/consultations/${dose.consultationId}/doses/${dose.id}`
      return deviceRequest<unknown>(credential, path, 'PATCH', { taken })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: phoneKey() }),
  })
}

/** «Realizado»: marks the next dose of the day of an activity. */
export function useDone(credential: string, from: Date, to: Date) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (routineId: string) =>
      deviceRequest<unknown>(credential, `/child-device/routines/${routineId}/done`, 'POST', { from: from.toISOString(), to: to.toISOString() }),
    // Another device marking the last dose first answers «nothing to mark»: the list is read again either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: phoneKey() }),
  })
}

export type { Me }
