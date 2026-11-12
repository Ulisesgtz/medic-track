import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import {
  installConnectivity,
  isApiRequest,
  isOffline,
  OfflineError,
  reportNetworkFailure,
  reportReachable,
  resetConnectivity,
  setOfflineSession,
  trackedFetch,
  useConnectivity,
} from './connectivity'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

beforeEach(() => resetConnectivity())
afterEach(() => {
  resetConnectivity()
  vi.restoreAllMocks()
})

describe('connectivity', () => {
  it('goes offline when a request fails for the network and back with any answer', () => {
    expect(isOffline()).toBe(false)
    reportNetworkFailure()
    expect(isOffline()).toBe(true)
    reportReachable()
    expect(isOffline()).toBe(false)
  })

  it('is offline while the app shows the phone’s copy without a session', () => {
    setOfflineSession(true)
    reportReachable()
    expect(isOffline()).toBe(true)
    setOfflineSession(false)
    expect(isOffline()).toBe(false)
  })

  it('tells the screens', () => {
    const { result } = renderHook(() => useConnectivity())
    expect(result.current).toBe('online')
    act(() => reportNetworkFailure())
    expect(result.current).toBe('offline')
  })

  it('knows the API’s requests', () => {
    expect(isApiRequest(`${API}/accounts/me`)).toBe(true)
    expect(isApiRequest('/version.json')).toBe(false)
  })
})

describe('trackedFetch', () => {
  it('refuses a change without a connection, before the network', async () => {
    const original = vi.fn(async () => new Response('{}'))
    const tracked = trackedFetch(original as unknown as typeof fetch)
    reportNetworkFailure()
    await expect(tracked(`${API}/consultations/k1/doses/d1`, { method: 'PATCH' })).rejects.toBeInstanceOf(OfflineError)
    await expect(tracked(new Request(`${API}/children/c1/consultations`, { method: 'POST' }))).rejects.toBeInstanceOf(OfflineError)
    expect(original).not.toHaveBeenCalled()
  })

  it('still lets reads through without a connection', async () => {
    const original = vi.fn(async () => new Response('{}'))
    const tracked = trackedFetch(original as unknown as typeof fetch)
    reportNetworkFailure()
    await tracked(new URL(`${API}/accounts/me`))
    expect(original).toHaveBeenCalledTimes(1)
    expect(isOffline()).toBe(false)
  })

  it('reports a network failure and keeps throwing it', async () => {
    const tracked = trackedFetch((async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch)
    await expect(tracked(`${API}/accounts/me`)).rejects.toBeInstanceOf(TypeError)
    expect(isOffline()).toBe(true)
  })

  it('does not count another kind of failure as offline', async () => {
    const tracked = trackedFetch((async () => {
      throw new DOMException('aborted', 'AbortError')
    }) as unknown as typeof fetch)
    await expect(tracked(`${API}/accounts/me`)).rejects.toBeInstanceOf(DOMException)
    expect(isOffline()).toBe(false)
  })

  it('leaves alone what isn’t the API', async () => {
    const original = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const tracked = trackedFetch(original as unknown as typeof fetch)
    reportNetworkFailure()
    await expect(tracked('/version.json', { method: 'POST' })).rejects.toBeInstanceOf(TypeError)
    expect(original).toHaveBeenCalled()
  })
})

describe('installConnectivity', () => {
  it('wraps fetch once, follows the browser and drives TanStack’s online manager', async () => {
    vi.useFakeTimers()
    const original = vi.fn(async () => new Response('{}'))
    window.fetch = original as unknown as typeof fetch
    installConnectivity()
    installConnectivity()
    expect(window.fetch).not.toBe(original)

    act(() => reportNetworkFailure())
    expect(onlineManager.isOnline()).toBe(false)
    // While the API doesn't answer, a light read every 10 s notices the signal coming back.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(original).toHaveBeenCalledWith(`${API}/catalog/countries`, expect.anything())
    expect(onlineManager.isOnline()).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
      window.dispatchEvent(new Event('online'))
    })
    vi.useRealTimers()
  })
})
