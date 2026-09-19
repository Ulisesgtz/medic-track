import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDoseToggle } from './useDoseToggle'

describe('useDoseToggle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the dose and refreshes both the consultation detail and the child overview', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'd1', scheduledAt: '2026-01-15T08:00:00Z', taken: true }) }),
    )
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useDoseToggle('c1', 'd1'), { wrapper })

    await act(async () => {
      result.current.mutate(true)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/consultations/c1/doses/d1'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ taken: true }) }),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['consultation', 'c1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overview'] })
  })
})
