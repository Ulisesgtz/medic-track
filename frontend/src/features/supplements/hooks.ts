import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { DOSE_REFETCH_MS } from '../consultations/doseStatus'
import type { Account } from '../home/types'
import { useChildAccess } from '../family/useChildAccess'
import {
  createRoutine,
  fetchRoutine,
  fetchRoutines,
  finishRoutine,
  pauseRoutine,
  resumeRoutine,
  setMyReminders,
  updateRoutine,
  updateRoutineDose,
} from './api'
import type { RoutineInput } from './types'

/** The child's routines with the doses of the parent's local day; asked again every minute so a dose turns "sin registrar" on its own. */
export function useRoutines(childId: string | undefined, day: { from: Date; to: Date }) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['routines', childId, day.from.toISOString()],
    queryFn: async () => fetchRoutines(childId!, day.from, day.to, await getToken()),
    enabled: !!childId,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  })
}

/** One routine with the doses of a month (the calendar's). */
export function useRoutine(routineId: string | undefined, range: { from: Date; to: Date }) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['routine', routineId, range.from.toISOString()],
    queryFn: async () => fetchRoutine(routineId!, range.from, range.to, await getToken()),
    enabled: !!routineId,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  })
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

/** «Tus avisos»: the session's own reminders of one routine, on or off. */
export function useMyReminders(routineId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (enabled: boolean) => setMyReminders(routineId, enabled, await getToken()),
    onSuccess: refresh,
  })
}

/** Marks or unmarks one routine dose (never depends on the plan) and refreshes every screen that shows it. */
export function useRoutineDoseToggle(routineId: string, doseId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (taken: boolean) => updateRoutineDose(routineId, doseId, taken, await getToken()),
    onSuccess: refresh,
  })
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
