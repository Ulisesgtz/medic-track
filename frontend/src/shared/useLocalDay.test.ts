import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalDay } from './useLocalDay'

describe('useLocalDay', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts as the local day [midnight, next midnight)", () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 8, 18, 16, 30))

    const { result } = renderHook(() => useLocalDay())

    expect(result.current.from).toEqual(new Date(2026, 8, 18))
    expect(result.current.to).toEqual(new Date(2026, 8, 19))
  })

  it('rolls over to the next day at local midnight, without a reload', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 8, 18, 23, 59, 30))
    const { result } = renderHook(() => useLocalDay())
    const first = result.current

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.from).toEqual(new Date(2026, 8, 19))
    expect(result.current).not.toBe(first)
  })

  it('re-checks when the app comes back to the foreground after sitting overnight', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 8, 18, 22, 0))
    const { result } = renderHook(() => useLocalDay())

    // The device slept: the clock jumps a day without the timer ever firing.
    vi.setSystemTime(new Date(2026, 8, 19, 9, 0))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(result.current.from).toEqual(new Date(2026, 8, 19))
  })

  it('keeps the very same object while it is still the same day', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 8, 18, 10, 0))
    const { result } = renderHook(() => useLocalDay())
    const first = result.current

    vi.setSystemTime(new Date(2026, 8, 18, 15, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(result.current).toBe(first)
  })
})
