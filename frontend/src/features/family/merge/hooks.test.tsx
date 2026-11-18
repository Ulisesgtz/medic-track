import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/react', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => 'tok' }) }))
const api = vi.hoisted(() => ({
  getMergeOptions: vi.fn(),
  previewMerge: vi.fn(),
  mergeChildren: vi.fn(),
  setHiddenChildren: vi.fn(),
}))
vi.mock('./api', () => api)
const forget = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../../shared/offline/persistence', () => ({
  forgetQuery: forget,
  subjectOfKey: (k: unknown[]) => (k[0] === 'consultations' ? (k[1] as string) : null),
}))

import { forgetChild, useMergeChildren, useMergeOptions, usePreviewMerge, useSetHiddenChildren } from './hooks'

let qc: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>

beforeEach(() => {
  vi.clearAllMocks()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('merge hooks', () => {
  it('reads the options', async () => {
    api.getMergeOptions.mockResolvedValue({ canMerge: true })
    const { result } = renderHook(() => useMergeOptions(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ canMerge: true }))
    expect(api.getMergeOptions).toHaveBeenCalledWith('tok')
  })

  it('previews with the token', async () => {
    api.previewMerge.mockResolvedValue([])
    const { result } = renderHook(() => usePreviewMerge(), { wrapper })
    await act(() => result.current.mutateAsync([{ ownChildId: 'o', familyChildId: 'f' }]))
    expect(api.previewMerge).toHaveBeenCalledWith([{ ownChildId: 'o', familyChildId: 'f' }], 'tok')
  })

  it('after merging invalidates the account and the family and forgets the own child', async () => {
    qc.setQueryData(['consultations', 'o1'], [1])
    qc.setQueryData(['consultations', 'other'], [2])
    const spy = vi.spyOn(qc, 'invalidateQueries')
    api.mergeChildren.mockResolvedValue([
      { ownChildId: 'o1', familyChildId: 'f1', status: 'merged' },
      { ownChildId: 'o2', familyChildId: 'f2', status: 'failed', error: 'record_too_long' },
    ])
    const { result } = renderHook(() => useMergeChildren(), { wrapper })
    await act(() => result.current.mutateAsync([]))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts', 'me'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['family'] })
    expect(forget).toHaveBeenCalledTimes(1)
    expect(forget).toHaveBeenCalledWith(qc, ['consultations', 'o1'])
  })

  it('hides children and refreshes the account', async () => {
    const spy = vi.spyOn(qc, 'invalidateQueries')
    api.setHiddenChildren.mockResolvedValue({})
    const { result } = renderHook(() => useSetHiddenChildren('a1'), { wrapper })
    await act(() => result.current.mutateAsync(['c1']))
    expect(api.setHiddenChildren).toHaveBeenCalledWith('a1', ['c1'], 'tok')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts', 'me'] })
  })

  it('forgetChild ignores other keys', async () => {
    qc.setQueryData(['consultations', 'x'], 1)
    await forgetChild(qc, 'y')
    expect(forget).not.toHaveBeenCalled()
  })
})
