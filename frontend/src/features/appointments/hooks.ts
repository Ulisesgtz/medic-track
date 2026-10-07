import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { DOSE_REFETCH_MS } from '../consultations/doseStatus'
import type { Account } from '../home/types'
import { useChildAccess } from '../family/useChildAccess'
import {
  createAppointment,
  fetchAppointment,
  fetchChildAppointments,
  fetchConsultationAppointment,
  setAppointmentReminders,
  setAppointmentStatus,
  updateAppointment,
} from './api'
import type { AppointmentInput } from './types'

/** The child's next appointment and history; asked again every minute so «Pasó sin marcar» appears on its own. */
export function useChildAppointments(childId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['appointments', 'child', childId],
    queryFn: async () => fetchChildAppointments(childId!, await getToken()),
    enabled: !!childId,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  })
}

/** The consultation's scheduled appointment, or none. */
export function useConsultationAppointment(consultationId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['appointments', 'consultation', consultationId],
    queryFn: async () => fetchConsultationAppointment(consultationId!, await getToken()),
    enabled: !!consultationId,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  })
}

export function useAppointment(appointmentId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['appointments', 'one', appointmentId],
    queryFn: async () => fetchAppointment(appointmentId!, await getToken()),
    enabled: !!appointmentId,
    retry: false,
  })
}

/** Everything that shows an appointment asks again after a change. */
function useRefreshAfterChange() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['appointments'] })
}

export function useCreateAppointment(consultationId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (input: AppointmentInput) => createAppointment(consultationId, input, await getToken()),
    onSuccess: refresh,
  })
}

export function useUpdateAppointment(appointmentId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (input: AppointmentInput) => updateAppointment(appointmentId, input, await getToken()),
    onSuccess: refresh,
  })
}

export function useSetAppointmentStatus(appointmentId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (status: 'done' | 'canceled' | 'scheduled') => setAppointmentStatus(appointmentId, status, await getToken()),
    onSuccess: refresh,
  })
}

export function useMyAppointmentReminders(appointmentId: string) {
  const { getToken } = useAuth()
  const refresh = useRefreshAfterChange()
  return useMutation({
    mutationFn: async (enabled: boolean) => setAppointmentReminders(appointmentId, enabled, await getToken()),
    onSuccess: refresh,
  })
}

/**
 * What the session can do with the appointments of ONE child: the plan is the server's `paidPlan`; **nothing is offered until
 * the account has loaded**. A Caregiver only sees and chooses their own reminders.
 */
export interface AppointmentAccess {
  /** Create or edit: can do everything AND the plan is paid. */
  canEdit: boolean
  /** The free plan's notice replaces the fields (only for who could edit if the plan were paid). */
  showPlan: boolean
  /** Mark done or canceled: can do everything, whatever the plan. */
  canMark: boolean
  /** Someone who only sees: told that a Tutor edits. */
  isViewer: boolean
}

export function useAppointmentAccess(account: Account | undefined, childId: string | undefined, paidPlan: boolean | undefined): AppointmentAccess {
  const access = useChildAccess(account, childId)
  const known = account !== undefined
  const manager = known && (access.role === 'owner' || access.role === 'tutor')
  return {
    canEdit: known && access.canAdd && paidPlan === true,
    showPlan: manager && paidPlan === false,
    canMark: known && access.canAdd,
    isViewer: known && !manager,
  }
}
