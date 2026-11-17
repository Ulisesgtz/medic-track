import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as connectivity from '../offline/connectivity'
import { API_BASE_URL, OfflineError } from '../offline/connectivity'
import {
  GROUP_WINDOW_MS,
  MAX_REPORTS_PER_LOAD,
  reportClientError,
  resetClientErrorReports,
} from './report'
import { installClientErrors } from './install'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  resetClientErrorReports()
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(connectivity, 'isOffline').mockReturnValue(false)
  window.history.pushState({}, '', '/consultations/3e34a679-9b24-4c1d-8a5e-0123456789ab')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function sentBodies() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

describe('reportClientError', () => {
  it('sends one cleaned report 3 s later, with the contract fields and no real address', () => {
    reportClientError('render', new Error("Cannot read properties of undefined (reading 'doses')"))
    expect(fetchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_BASE_URL}/client-errors`)
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' })
    const body = sentBodies()[0]
    expect(body).toEqual({
      kind: 'render',
      message: "Cannot read properties of undefined (reading 'doses')",
      route: '/consultations/:consultationId',
      version: expect.stringMatching(/^[A-Za-z0-9.-]{1,20}$/),
      browser: expect.any(String),
      os: expect.any(String),
      installed: false,
      count: 1,
    })
    const text = JSON.stringify(body)
    expect(text).not.toContain('3e34a679')
    expect(text).not.toContain(navigator.userAgent)
  })

  it('groups equal errors and sends one with the count', () => {
    for (let i = 0; i < 3; i++) reportClientError('error', new Error('boom'))
    reportClientError('error', new Error('other'))
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    const bodies = sentBodies()
    expect(bodies).toHaveLength(2)
    expect(bodies.find((b) => b.message === 'boom').count).toBe(3)
  })

  it('cleans what a message carries', () => {
    reportClientError('error', 'falló para ana@example.com folio 12345')
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(sentBodies()[0].message).toBe('falló para [correo] folio [n]')
  })

  it('caps the count the server accepts', () => {
    for (let i = 0; i < 1200; i++) reportClientError('error', new Error('loop'))
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(sentBodies()[0].count).toBe(1000)
  })

  it('sends at most 5 reports per page load', () => {
    for (let i = 0; i < MAX_REPORTS_PER_LOAD + 3; i++)
      reportClientError('error', new Error(`e${i}`))
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REPORTS_PER_LOAD)
  })

  it('sends nothing and keeps nothing without a connection', () => {
    vi.spyOn(connectivity, 'isOffline').mockReturnValue(true)
    reportClientError('error', new Error('x'))
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.spyOn(connectivity, 'isOffline').mockReturnValue(false)
    vi.advanceTimersByTime(GROUP_WINDOW_MS * 2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops the report if the connection was lost while it waited', () => {
    reportClientError('error', new Error('x'))
    vi.spyOn(connectivity, 'isOffline').mockReturnValue(true)
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores the noise: Script error, ResizeObserver, offline and aborted requests', () => {
    reportClientError('error', 'Script error.')
    reportClientError(
      'error',
      new Error('ResizeObserver loop completed with undelivered notifications.'),
    )
    reportClientError('rejection', new OfflineError())
    reportClientError('rejection', new DOMException('aborted', 'AbortError'))
    const abort = new Error('cancelled')
    abort.name = 'AbortError'
    reportClientError('rejection', abort)
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses a fixed sentence when there is no message, and the error name when the message is empty', () => {
    reportClientError('rejection', undefined)
    reportClientError('rejection', new TypeError(''))
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(
      sentBodies()
        .map((b) => b.message)
        .sort(),
    ).toEqual(['TypeError', 'Unknown error'])
  })

  it('never throws, retries or reports again when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    reportClientError('error', new Error('x'))
    await vi.advanceTimersByTimeAsync(GROUP_WINDOW_MS * 5)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('survives a fetch that throws at once', () => {
    fetchMock.mockImplementation(() => {
      throw new Error('sync')
    })
    reportClientError('error', new Error('x'))
    expect(() => vi.advanceTimersByTime(GROUP_WINDOW_MS)).not.toThrow()
  })

  it('says `other` for a route that is not a screen', () => {
    window.history.pushState({}, '', '/algo/raro/ana-lopez')
    reportClientError('error', new Error('x'))
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    expect(sentBodies()[0].route).toBe('other')
  })
})

describe('installClientErrors', () => {
  it('listens once for errors and rejections, and skips errors of another origin', () => {
    installClientErrors()
    installClientErrors()
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('uncaught'),
        message: 'uncaught',
        filename: window.location.href,
      }),
    )
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'from an extension',
        filename: 'chrome-extension://abc/x.js',
      }),
    )
    window.dispatchEvent(new ErrorEvent('error', { message: 'no file', filename: '' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'odd file', filename: 'http://[bad' }))
    const rejection = new Event('unhandledrejection') as Event & { reason: unknown }
    rejection.reason = new Error('rejected')
    window.dispatchEvent(rejection)
    vi.advanceTimersByTime(GROUP_WINDOW_MS)
    const bodies = sentBodies()
    expect(bodies.map((b) => `${b.kind}:${b.message}`).sort()).toEqual([
      'error:no file',
      'error:odd file',
      'error:uncaught',
      'rejection:rejected',
    ])
  })
})
