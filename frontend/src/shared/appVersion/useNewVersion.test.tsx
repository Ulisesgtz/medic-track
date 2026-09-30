import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { fetchPublishedVersion, resetNewVersion, useNewVersion, VERSION_CHECK_MS } from './useNewVersion'

function Probe() {
  return <p>{useNewVersion() ? 'nueva' : 'igual'}</p>
}

const answer = (body: unknown, ok = true) =>
  vi.mocked(fetch).mockResolvedValue({ ok, json: async () => body } as Response)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  resetNewVersion()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchPublishedVersion (specs/017)', () => {
  it('reads the version, never from the cache', async () => {
    answer({ version: 'abc' })

    expect(await fetchPublishedVersion()).toBe('abc')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/^\/version\.json\?t=\d+$/)
    expect(init).toMatchObject({ cache: 'no-store' })
  })

  it('has no answer when it is offline, not 2xx, not JSON or without a version', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    expect(await fetchPublishedVersion()).toBeNull()

    answer({ version: 'x' }, false)
    expect(await fetchPublishedVersion()).toBeNull()

    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError('<html>')) } as unknown as Response)
    expect(await fetchPublishedVersion()).toBeNull()

    answer(null)
    expect(await fetchPublishedVersion()).toBeNull()
    answer({ version: 3 })
    expect(await fetchPublishedVersion()).toBeNull()
    answer({ version: '' })
    expect(await fetchPublishedVersion()).toBeNull()
  })
})

describe('useNewVersion (specs/017)', () => {
  it('is false when the published version is the one running, or there is no answer', async () => {
    answer({ version: __APP_VERSION__ })
    render(<Probe />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByText('igual')).toBeInTheDocument()
  })

  it('is true as soon as the published version differs, and stops asking', async () => {
    answer({ version: 'otra' })
    render(<Probe />)
    expect(await screen.findByText('nueva')).toBeInTheDocument()

    const calls = vi.mocked(fetch).mock.calls.length
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
  })

  it('checks again when the app comes back to the foreground, but not while it is hidden', async () => {
    answer({ version: __APP_VERSION__ })
    render(<Probe />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    answer({ version: 'otra' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByText('nueva')).toBeInTheDocument()
  })

  it('checks again every ten minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    answer({ version: __APP_VERSION__ })
    render(<Probe />)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    answer({ version: 'otra' })
    await act(async () => vi.advanceTimersByTime(VERSION_CHECK_MS + 10))

    expect(await screen.findByText('nueva')).toBeInTheDocument()
  })

  it('remembers it across screens: a screen mounted later starts with the notice already on', async () => {
    answer({ version: 'otra' })
    const first = render(<Probe />)
    expect(await screen.findByText('nueva')).toBeInTheDocument()
    first.unmount()

    vi.mocked(fetch).mockClear()
    render(<Probe />)

    expect(screen.getByText('nueva')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not answer after it is gone', async () => {
    let resolve: (value: Response) => void = () => {}
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    const { unmount } = render(<Probe />)
    unmount()

    await act(async () => resolve({ ok: true, json: async () => ({ version: 'otra' }) } as Response))

    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
