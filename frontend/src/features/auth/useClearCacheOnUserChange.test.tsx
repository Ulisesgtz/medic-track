import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '@clerk/react'
import { useClearCacheOnUserChange } from './useClearCacheOnUserChange'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

function setup(initial: { isLoaded: boolean; userId: string | null | undefined }) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['accounts', 'me'], { id: 'previous-tutor' })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  vi.mocked(useAuth).mockReturnValue(initial as unknown as ReturnType<typeof useAuth>)
  const view = renderHook(() => useClearCacheOnUserChange(), { wrapper })
  const change = (next: { isLoaded: boolean; userId: string | null | undefined }) => {
    vi.mocked(useAuth).mockReturnValue(next as unknown as ReturnType<typeof useAuth>)
    view.rerender()
  }
  return { queryClient, change }
}

describe('useClearCacheOnUserChange', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the cache while Clerk loads and on the first resolved user', () => {
    const { queryClient, change } = setup({ isLoaded: false, userId: undefined })

    change({ isLoaded: true, userId: 'user_a' })

    expect(queryClient.getQueryData(['accounts', 'me'])).toEqual({ id: 'previous-tutor' })
  })

  it('clears it when the session ends without our own logout (expired, or signed out elsewhere)', () => {
    const { queryClient, change } = setup({ isLoaded: true, userId: 'user_a' })

    change({ isLoaded: true, userId: null })

    expect(queryClient.getQueryData(['accounts', 'me'])).toBeUndefined()
  })

  it('clears it when a different tutor signs in', () => {
    const { queryClient, change } = setup({ isLoaded: true, userId: 'user_a' })

    change({ isLoaded: true, userId: 'user_b' })

    expect(queryClient.getQueryData(['accounts', 'me'])).toBeUndefined()
  })

  it('leaves it alone when the same user just re-renders', () => {
    const { queryClient, change } = setup({ isLoaded: true, userId: 'user_a' })

    change({ isLoaded: true, userId: 'user_a' })

    expect(queryClient.getQueryData(['accounts', 'me'])).toEqual({ id: 'previous-tutor' })
  })
})
