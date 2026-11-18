import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { forgetQuery, subjectOfKey } from '../../../shared/offline/persistence'
import { getMergeOptions, mergeChildren, previewMerge, setHiddenChildren } from './api'
import type { MergePairRequest, PairIds } from './types'

/** Pairs and data of both sides (`GET /family/merge-options`). */
export function useMergeOptions(enabled = true) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  return useQuery({
    queryKey: ['family', 'merge-options'],
    queryFn: async () => getMergeOptions(await getToken()),
    enabled: enabled && isLoaded && isSignedIn === true,
    retry: false,
    gcTime: 0,
  })
}

/** The preview changes nothing; a mutation so it is asked on demand with the pairs in the body. */
export function usePreviewMerge() {
  const { getToken } = useAuth()
  return useMutation({ mutationFn: async (pairs: PairIds[]) => previewMerge(pairs, await getToken()) })
}

/** Forget what the memory and the phone kept of a child: every key whose subject is it. */
export async function forgetChild(queryClient: QueryClient, childId: string): Promise<void> {
  const keys = queryClient
    .getQueryCache()
    .findAll()
    .filter((q) => subjectOfKey(q.queryKey) === childId)
    .map((q) => q.queryKey)
  for (const key of keys) await forgetQuery(queryClient, key)
}

export function useMergeChildren() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pairs: MergePairRequest[]) => mergeChildren(pairs, await getToken()),
    onSuccess: async (results) => {
      for (const r of results) if (r.status === 'merged') await forgetChild(queryClient, r.ownChildId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['family'] }),
      ])
    },
  })
}

/** Hide / show own children (`PUT /accounts/{id}/hidden-children`). */
export function useSetHiddenChildren(accountId: string) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (childIds: string[]) => setHiddenChildren(accountId, childIds, await getToken()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
      await queryClient.invalidateQueries({ queryKey: ['family'] })
    },
  })
}
