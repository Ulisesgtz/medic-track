import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCountries, useStates } from './useCatalog'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: queryClient, children })
}

describe('useCatalog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('useCountries returns the fetched countries list', async () => {
    const mockCountries = [{ code: 'MX', name: 'México' }]
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCountries,
    } as Response)

    const { result } = renderHook(() => useCountries(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockCountries)
  })

  it('useStates is disabled until a country code is provided', () => {
    const { result } = renderHook(() => useStates(undefined), { wrapper: createWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('useStates returns an empty array for a country with no subdivisions (404)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => [],
    } as Response)

    const { result } = renderHook(() => useStates('US'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})
