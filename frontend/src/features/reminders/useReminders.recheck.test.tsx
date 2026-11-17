import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Account } from '../home/types'
import { clearPushEnv, stubApi, stubPushEnv } from './pushEnv.test-utils'
import { useReminders } from './useReminders'

const account: Account = {
  id: 'a1',
  firstName: 'Ana',
  lastName: 'Gómez',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'free',
  children: [],
  disclaimerVersion: '2026-09-26',
  disclaimerAccepted: true,
  reminderDetail: 'generic',
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useReminders().recheck (specs/071: «Ya los activé»)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearPushEnv()
    localStorage.clear()
  })

  it('reads the browser again: a permission changed in the site settings turns «denied» into «off»', async () => {
    const env = stubPushEnv({ permission: 'denied' })
    stubApi({ 'GET /reminders/config': { body: { available: true, vapidPublicKey: 'AQID' } } })
    const { result } = renderHook(() => useReminders(account), { wrapper })
    expect(result.current.state).toBe('denied')

    // The person allows notifications in the settings and comes back to the open page.
    env.notification.permission = 'granted'
    let found: string | undefined
    act(() => {
      found = result.current.recheck()
    })

    expect(found).toBe('ready')
    await waitFor(() => expect(result.current.state).toBe('off'))
  })

  it('a permission that is still refused stays refused', () => {
    stubPushEnv({ permission: 'denied' })
    const { result } = renderHook(() => useReminders(account), { wrapper })
    let found: string | undefined
    act(() => {
      found = result.current.recheck()
    })
    expect(found).toBe('denied')
    expect(result.current.state).toBe('denied')
  })
})
