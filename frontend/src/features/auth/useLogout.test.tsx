import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { useLogout } from './useLogout'
import { callsTo, clearPushEnv, stubApi, stubPushEnv } from '../reminders/pushEnv.test-utils'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

describe('useLogout', () => {
  let signOut: ReturnType<typeof vi.fn>

  beforeEach(() => {
    signOut = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({ signOut, getToken: vi.fn().mockResolvedValue('tok') } as unknown as ReturnType<typeof useAuth>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearPushEnv()
  })

  function setup(account?: { id: string }) {
    const queryClient = new QueryClient()
    if (account) queryClient.setQueryData(['accounts', 'me'], account)
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    return { ...renderHook(() => useLogout(), { wrapper }), queryClient }
  }

  it('turns this browser\'s reminders off before signing out (FR-012), then clears the cache', async () => {
    const env = stubPushEnv({ permission: 'granted', subscribed: true })
    const fetchMock = stubApi({ 'POST /accounts/a1/reminder-devices/remove': { status: 204 } })
    const { result, queryClient } = setup({ id: 'a1' })

    await result.current()

    expect(env.subscription.unsubscribe).toHaveBeenCalled()
    expect(callsTo(fetchMock, 'POST', '/remove')).toHaveLength(1)
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ redirectUrl: '/login' })
    expect(queryClient.getQueryData(['accounts', 'me'])).toBeUndefined()
  })

  it('signs out even when there is no account loaded or the backend fails', async () => {
    stubPushEnv({ permission: 'granted', subscribed: true })
    stubApi({})
    await setup({ id: 'a1' }).result.current()
    expect(signOut).toHaveBeenCalledTimes(1)

    await setup().result.current()
    expect(signOut).toHaveBeenCalledTimes(2)
  })
})
