import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAccountSignup } from './useAccountSignup'
import { CreateAccountError } from './api'

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: queryClient, children })
}

describe('useAccountSignup', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces a freemium_child_limit_exceeded error on 422 without throwing away caller state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'freemium_child_limit_exceeded',
        message: 'The free plan includes only one child per account',
        limit: 1,
        received: 2,
      }),
    } as Response)

    const { result } = renderHook(() => useAccountSignup(), { wrapper: createWrapper() })

    act(() => {
      result.current.mutate({
        payload: {
          firstName: 'Carla',
          lastName: 'Ruiz',
          children: [
            { firstName: 'H1', lastName: 'Ruiz', birthDate: '2018-01-01' },
            { firstName: 'H2', lastName: 'Ruiz', birthDate: '2021-01-01' },
          ],
        },
        token: 'test-token',
      })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeInstanceOf(CreateAccountError)
    expect((result.current.error as CreateAccountError).kind).toBe('freemium_child_limit_exceeded')
    // The hook itself holds no form field state to lose — it only reports
    // success/error, so the caller (AccountSignupForm) keeps its own values.
    expect(result.current.data).toBeUndefined()
  })

  it('reports success with the created account on 201', async () => {
    const created = {
      id: 'abc-123',
      firstName: 'Ana',
      lastName: 'Gómez',
      email: 'ana@example.com',
      countryCode: null,
      stateCode: null,
      plan: 'free',
      children: [],
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => created,
    } as Response)

    const { result } = renderHook(() => useAccountSignup(), { wrapper: createWrapper() })

    act(() => {
      result.current.mutate({
        payload: { firstName: 'Ana', lastName: 'Gómez', children: [] },
        token: 'test-token',
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(created)
  })
})
