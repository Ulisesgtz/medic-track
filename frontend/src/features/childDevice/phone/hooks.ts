import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatTime } from '../../../shared/date'
import { requestMark } from '../../../shared/marks/requestMark'
import { useShownQuery } from '../../../shared/marks/usePendingMarks'
import type { ChildOverview, OverviewDose } from '../../consultations/types'
import type { Routine, RoutineList } from '../../supplements/types'
import { deviceRequest, fetchMe, PhoneApiError, type Me } from './api'
import { writeCredential } from './storage'
import { useOfflineFallback } from '../../../shared/offline/useOfflineFallback'

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
  useOfflineFallback(phoneKey('overview', childId, from.toISOString()), 3)
  return useShownQuery(useQuery({
    queryKey: phoneKey('overview', childId, from.toISOString()),
    queryFn: () => deviceRequest<ChildOverview>(credential, `/child-device/children/${childId}/overview?${windowQuery(from, to)}`),
    enabled: !!childId,
    retry: false,
    refetchInterval: REFRESH_MS,
  }))
}

/** The child's activities with the doses of today. */
export function useActivities(credential: string, childId: string | undefined, from: Date, to: Date) {
  useOfflineFallback(phoneKey('activities', childId, from.toISOString()), 3)
  return useShownQuery(useQuery({
    queryKey: phoneKey('activities', childId, from.toISOString()),
    queryFn: async () => {
      const query = windowQuery(from, to)
      query.set('kind', 'activity')
      return (await deviceRequest<RoutineList>(credential, `/child-device/children/${childId}/routines?${query}`)).routines as Routine[]
    },
    enabled: !!childId,
    retry: false,
    refetchInterval: REFRESH_MS,
  }))
}

/** Marks or unmarks a dose of a medication or of a supplement. A mark is the phone's own: the server refuses to take back another's. */
export function useMarkDose(credential: string) {
  const queryClient = useQueryClient()
  return {
    isPending: false as const,
    // specs/066: the mark shows at once and goes back, with the notice, if the server didn't save it.
    mutate: ({ dose, taken }: { dose: OverviewDose; taken: boolean }) => {
      const path =
        dose.kind === 'supplement' && dose.routineId
          ? `/child-device/routines/${dose.routineId}/doses/${dose.id}`
          : `/child-device/consultations/${dose.consultationId}/doses/${dose.id}`
      void requestMark({
        queryClient,
        dose: { id: dose.id, name: dose.medicationName, time: formatTime(dose.scheduledAt) },
        taken,
        send: (wanted) => deviceRequest<unknown>(credential, path, 'PATCH', { taken: wanted }),
        invalidate: () => queryClient.invalidateQueries({ queryKey: phoneKey() }),
      })
    },
  }
}

/** «Realizado»: marks the next dose of the day of an activity. */
export function useDone(credential: string, from: Date, to: Date) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: phoneKey() })
  return {
    isPending: false as const,
    // specs/066: the earliest unmarked dose of the day the screen has shows marked at once (the server's own rule); what the
    // server marked wins. Another device marking the last dose first answers «nothing to mark»: the list is read again either way.
    mutate: (activity: Pick<Routine, 'id' | 'name' | 'doses'>) => {
      const send = () => deviceRequest<unknown>(credential, `/child-device/routines/${activity.id}/done`, 'POST', { from: from.toISOString(), to: to.toISOString() })
      const next = activity.doses.filter((d) => !d.taken).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
      if (!next) {
        void send().catch(() => undefined).finally(invalidate)
        return
      }
      void requestMark({ queryClient, dose: { id: next.id, name: activity.name, time: formatTime(next.scheduledAt) }, taken: true, send, invalidate })
    },
  }
}

/**
 * Renews the phone's credential once its time has come (`rotateAfter` of /me): the new one is kept BEFORE the old one is forgotten, and
 * the server lets the old one work for a day more, so two tabs or a lost answer don't leave the phone without access. Failing is silent:
 * the next visit tries again, and if the access is gone /me says so.
 */
export function useRotation(credential: string, rotateAfter: string | undefined, onRotated: (credential: string) => void) {
  const queryClient = useQueryClient()
  const running = useRef(false)
  // The `rotateAfter` already acted on: after a renewal the old value may still be in view for a moment, and it must not renew twice.
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!rotateAfter || running.current || handled.current === rotateAfter || new Date(rotateAfter).getTime() > Date.now()) return
    running.current = true
    handled.current = rotateAfter
    deviceRequest<{ credential: string }>(credential, '/child-device/rotate', 'POST')
      .then((got) => {
        if (writeCredential(got.credential)) onRotated(got.credential)
        return queryClient.invalidateQueries({ queryKey: phoneKey('me') })
      })
      .catch(() => undefined)
      .finally(() => {
        running.current = false
      })
  }, [credential, rotateAfter, onRotated, queryClient])
}

export type { Me }
