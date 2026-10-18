import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelSubscription, fetchSubscription, startSubscription } from './api'
import { goToCheckout } from './navigate'

export const subscriptionKey = (accountId: string | undefined) => ['subscription', accountId] as const

/**
 * The state of the account's subscription. `refetchMs` makes the return page ask again while the payment is confirmed; the rest
 * of the time it is asked once (the plan itself is in `['accounts', 'me']`). Nothing is asked until the account is known.
 */
export function useSubscription(accountId: string | undefined, options: { refetchMs?: number | false } = {}) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: subscriptionKey(accountId),
    queryFn: async () => fetchSubscription(accountId!, await getToken()),
    enabled: !!accountId,
    retry: false,
    refetchInterval: options.refetchMs ?? false,
    // The return page counts the answers (even identical ones), so every answer must re-render it.
    notifyOnChangeProps: ['data', 'dataUpdatedAt', 'error', 'status', 'fetchStatus'],
  })
}

/** Starts the payment and, on success, sends the browser to the provider's page. */
export function useStartSubscription(accountId: string | undefined) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => startSubscription(accountId!, await getToken()),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: subscriptionKey(accountId) })
      goToCheckout(result.checkoutUrl)
    },
    // A refusal (the account is covered by a family, or already has the plan) changes what /planes should say.
    onError: () => void queryClient.invalidateQueries({ queryKey: subscriptionKey(accountId) }),
  })
}

/** Cancels the renewal; the plan and the account are asked again afterwards (the plan lasts until the end of what was paid). */
export function useCancelSubscription(accountId: string | undefined) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => cancelSubscription(accountId!, await getToken()),
    onSuccess: (state) => {
      queryClient.setQueryData(subscriptionKey(accountId), state)
      void queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
    },
  })
}
