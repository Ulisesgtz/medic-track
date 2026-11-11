import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { reportNetworkFailure, resetConnectivity } from './connectivity'
import { latestAnswer, useOfflineFallback } from './useOfflineFallback'

const TODAY = ['overview', 'c1', '2026-11-11T06:00:00.000Z']

function setup() {
  const client = new QueryClient()
  client.setQueryData(['overview', 'c1', '2026-11-09T06:00:00.000Z'], { day: 9 }, { updatedAt: 9 })
  client.setQueryData(['overview', 'c1', '2026-11-10T06:00:00.000Z'], { day: 10 }, { updatedAt: 10 })
  client.setQueryData(['overview', 'other', '2026-11-11T06:00:00.000Z'], { day: 'other' }, { updatedAt: 99 })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

beforeEach(() => resetConnectivity())
afterEach(() => resetConnectivity())

describe('useOfflineFallback', () => {
  it('does nothing with a connection', () => {
    const { client, wrapper } = setup()
    renderHook(() => useOfflineFallback(TODAY, 2), { wrapper })
    expect(client.getQueryData(TODAY)).toBeUndefined()
  })

  it('shows the newest day of the same child without a connection, with its own hour', () => {
    const { client, wrapper } = setup()
    renderHook(() => useOfflineFallback(TODAY, 2), { wrapper })
    act(() => reportNetworkFailure())
    expect(client.getQueryData(TODAY)).toEqual({ day: 10 })
    expect(client.getQueryState(TODAY)?.dataUpdatedAt).toBe(10)
  })

  it('never replaces today’s own answer', () => {
    const { client, wrapper } = setup()
    client.setQueryData(TODAY, { day: 11 }, { updatedAt: 11 })
    act(() => reportNetworkFailure())
    renderHook(() => useOfflineFallback(TODAY, 2), { wrapper })
    expect(client.getQueryData(TODAY)).toEqual({ day: 11 })
  })

  it('finds nothing for a subject never seen', () => {
    const { client } = setup()
    expect(latestAnswer(client, ['overview', 'nobody'], ['overview', 'nobody', 'x'])).toBeNull()
  })
})
