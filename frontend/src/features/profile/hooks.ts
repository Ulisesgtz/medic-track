import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchChildOverview, setConsultationSharing, setOwnReminders } from '../consultations/api'
import { DOSE_REFETCH_MS } from '../consultations/doseStatus'
import { useShownQuery } from '../../shared/marks/usePendingMarks'
import { subjectKey, type Subject } from '../../shared/subject'

/** A person's own doses of the day and their running treatment (specs/058): `GET /accounts/{id}/overview`. */
export function usePersonOverview(accountId: string | undefined, day: { from: Date; to: Date }, enabled = true) {
  const { getToken } = useAuth()
  const subject: Subject | undefined = accountId ? { kind: 'person', accountId } : undefined
  return useShownQuery(useQuery({
    queryKey: ['overview', subject ? subjectKey(subject) : undefined, day.from.toISOString()],
    queryFn: async () => fetchChildOverview(subject!, day.from, day.to, await getToken()),
    enabled: !!subject && enabled,
    retry: false,
    refetchInterval: DOSE_REFETCH_MS,
  }))
}

/** The switch «Compartir mis consultas con los Tutores de mi familia»: the account answers its new state. */
export function useConsultationSharing(accountId: string | undefined) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (shared: boolean) => setConsultationSharing(accountId!, shared, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] }),
  })
}

/** A Tutor's reminders of somebody's own consultation shared with them. */
export function useOwnReminders(consultationId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (on: boolean) => setOwnReminders(consultationId, on, await getToken()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultation', consultationId] }),
  })
}
