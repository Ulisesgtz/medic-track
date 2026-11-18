import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchChildRecord, saveChildRecord } from './api'
import type { ChildRecordInput } from './types'

export const childRecordKey = (childId: string | undefined) => ['child-record', childId] as const

/** The child's record (specs/073). */
export function useChildRecord(childId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: childRecordKey(childId),
    queryFn: async () => fetchChildRecord(childId as string, await getToken()),
    enabled: !!childId,
    retry: false,
  })
}

/** Saves the whole record; the answer is what the server kept, so it goes straight into the cache. */
export function useSaveChildRecord(childId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ChildRecordInput) => saveChildRecord(childId, input, await getToken()),
    onSuccess: (saved) => queryClient.setQueryData(childRecordKey(childId), saved),
  })
}
