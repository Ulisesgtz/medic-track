import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { formatTime } from '../../shared/date'
import { requestMark } from '../../shared/marks/requestMark'
import { useShownQuery } from '../../shared/marks/usePendingMarks'
import type { MarkToggle } from '../consultations/useDoseToggle'
import { DOSE_REFETCH_MS } from '../consultations/doseStatus'
import type { Account } from '../home/types'
import { useChildAccess } from '../family/useChildAccess'
import {
  acknowledgePersonalNotice,
  createPersonalRoutine,
  createRoutine,
  fetchPersonalRoutines,
  fetchRoutine,
  fetchRoutines,
  deleteRoutine,
  finishRoutine,
  markRoutineDone,
  pauseRoutine,
  resumeRoutine,
  setMyReminders,
  updateRoutine,
  updateRoutineDose,
} from './api'
import type { RoutineDose, RoutineInput, RoutineKind } from './types'

/** The child's supplements or activities with the doses of the parent's local day; asked again every minute so a dose turns "sin registrar" on its own. */
export function useRoutines(childId: string | undefined, kind: RoutineKind, day: { from: Date; to: Date }) {
  const { getToken } = useAuth()
  return useShownQuery(useQuery({
    queryKey: ['routines', childId, kind, day.from.toISOString()],
    queryFn: async () => fetchRoutines(childId!, kind, day.from, day.to, await getToken()),
    enabled: !!childId,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  }))
}

/** The person's OWN supplements or activities (specs/033, part 3) with the doses of their local day; same refresh as a child's. */
export function usePersonalRoutines(accountId: string | undefined, kind: RoutineKind, day: { from: Date; to: Date }, { poll = true }: { poll?: boolean } = {}) {
  const { getToken } = useAuth()
  return useShownQuery(useQuery({
    queryKey: ['routines', 'personal', accountId, kind, day.from.toISOString()],
    queryFn: async () => fetchPersonalRoutines(accountId!, kind, day.from, day.to, await getToken()),
    enabled: !!accountId,
    retry: false,
    // The sidebar only wants the count: it doesn't ask again every minute on every screen (the screens that show doses do).
    refetchInterval: poll ? DOSE_REFETCH_MS : false,
  }))
}

/** One routine with the doses of a month (the calendar's). */
export function useRoutine(routineId: string | undefined, range: { from: Date; to: Date }) {
  const { getToken } = useAuth()
  return useShownQuery(useQuery({
    queryKey: ['routine', routineId, range.from.toISOString()],
    queryFn: async () => fetchRoutine(routineId!, range.from, range.to, await getToken()),
    enabled: !!routineId,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  }))
}

/** Everything that shows a routine or its doses asks again after a change: the section, the detail and "Tomas de hoy". */
function useRefreshAfterChange() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['routines'] })
    queryClient.invalidateQueries({ queryKey: ['routine'] })
    queryClient.invalidateQueries({ queryKey: ['overview'] })
  }
}

export function useCreateRoutine(childId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (input: RoutineInput) => createRoutine(childId, input, await getToken()),
    onSuccess: refresh,
  })
}

export function useCreatePersonalRoutine(accountId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (input: RoutineInput) => createPersonalRoutine(accountId, input, await getToken()),
    onSuccess: refresh,
  })
}

/** «Entendido» on the personal section's first-time notice. */
export function useAcknowledgePersonalNotice(accountId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({ mutationFn: async () => acknowledgePersonalNotice(accountId, await getToken()), onSuccess: refresh })
}

export function useUpdateRoutine(routineId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (input: RoutineInput) => updateRoutine(routineId, input, await getToken()),
    onSuccess: refresh,
  })
}

export function usePauseRoutine(routineId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({ mutationFn: async () => pauseRoutine(routineId, await getToken()), onSuccess: refresh })
}

export function useResumeRoutine(routineId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    // The routine's times are read in the zone of the device that resumes it.
    mutationFn: async () => resumeRoutine(routineId, -new Date().getTimezoneOffset(), await getToken()),
    onSuccess: refresh,
  })
}

export function useFinishRoutine(routineId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({ mutationFn: async () => finishRoutine(routineId, await getToken()), onSuccess: refresh })
}

/** specs/060: deletes a routine with no marked dose. Its detail leaves the cache (it no longer exists); the lists and «Hoy» reload. */
export function useDeleteRoutine(routineId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => deleteRoutine(routineId, await getToken()),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['routine', routineId] })
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

/** «Tus avisos»: the session's own reminders of one routine, on or off. */
export function useMyReminders(routineId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (enabled: boolean) => setMyReminders(routineId, enabled, await getToken()),
    onSuccess: refresh,
  })
}

/**
 * «Realizado» on an activity (specs/035): the server marks the earliest unmarked dose of the person's local day. A 409
 * («nothing_to_mark», another device marked the last one first) is not an error to the person: the screens ask again.
 * Since specs/066 the count moves at once: with the day's doses the screen already has, the earliest unmarked one shows
 * marked while the request travels (the same rule as the server's, without reading the clock); what the server marked wins.
 */
export function useMarkDone(routineId: string, day: { from: Date; to: Date }, routine: { name?: string; doses?: Pick<RoutineDose, 'id' | 'scheduledAt' | 'taken'>[] } = {}) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const refresh = useRefreshAfterChange()
  const send = async () => markRoutineDone(routineId, day.from, day.to, await getToken())
  return {
    isPending: false as const,
    mutate: (_?: undefined, options?: { onSuccess?: () => void }) => {
      const inDay = (at: string) => new Date(at) >= day.from && new Date(at) < day.to
      const next = [...(routine.doses ?? [])].filter((d) => !d.taken && inDay(d.scheduledAt)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
      if (!next) {
        // Nothing to show ahead of the server: it decides, and «nothing to mark» is silent.
        void send().then(() => options?.onSuccess?.(), () => undefined).finally(refresh)
        return
      }
      void requestMark({
        queryClient,
        dose: { id: next.id, name: routine.name ?? '', time: formatTime(next.scheduledAt) },
        taken: true,
        send,
        invalidate: refresh,
        onSaved: options?.onSuccess,
      })
    },
  }
}

/** Marks or unmarks one routine dose (never depends on the plan) and refreshes every screen that shows it. */
export function useRoutineDoseToggle(routineId: string, doseId: string, label: { name?: string; scheduledAt?: string } = {}): MarkToggle {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const refresh = useRefreshAfterChange()
  return {
    isPending: false,
    mutate: (taken, options) =>
      void requestMark({
        queryClient,
        dose: { id: doseId, name: label.name ?? '', time: label.scheduledAt ? formatTime(label.scheduledAt) : '' },
        taken,
        send: async (wanted) => updateRoutineDose(routineId, doseId, wanted, await getToken()),
        invalidate: refresh,
        onSaved: options?.onSuccess,
      }),
  }
}

/**
 * What the session can do with the routines of ONE child (specs/033): everything is the child's family's plan and the
 * session's level there, and the server says whether the plan is paid (`paidPlan`) — never the session's own account plan.
 * A Caregiver (or Child-role member) only sees, marks and chooses their own reminders.
 */
export interface RoutineAccess {
  /** Create a routine: can do everything AND the plan is paid. */
  canCreate: boolean
  /** The free plan's card replaces "+ Nueva rutina" (only for who could create if the plan were paid). */
  showPlan: boolean
  /** Pause and finish: can do everything, whatever the plan (stopping is never blocked). */
  canStop: boolean
  /** Someone who only sees and marks: told that a Tutor creates and edits. */
  isViewer: boolean
}

export function useRoutineAccess(account: Account | undefined, childId: string | undefined, paidPlan: boolean | undefined): RoutineAccess {
  const access = useChildAccess(account, childId)
  // Until the account is known nothing is offered: a Caregiver must never see a button that would answer 403.
  const known = account !== undefined
  const manager = known && (access.role === 'owner' || access.role === 'tutor')
  return {
    canCreate: known && access.canAdd && paidPlan === true,
    showPlan: manager && paidPlan === false,
    canStop: known && access.canAdd,
    isViewer: known && !manager,
  }
}
