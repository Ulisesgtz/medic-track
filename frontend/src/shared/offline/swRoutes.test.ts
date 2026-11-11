import { describe, expect, it, vi } from 'vitest'
import { fallbackDocument, fetchWithin, isAppNavigation, isFontRequest } from './swRoutes'

const ORIGIN = 'https://dev.pedi-track.com'
const nav = { mode: 'navigate' }

describe('swRoutes', () => {
  it('falls back to the child document only under /hijo', () => {
    expect(fallbackDocument('/hijo')).toBe('/hijo/hoy.html')
    expect(fallbackDocument('/hijo/hoy')).toBe('/hijo/hoy.html')
    expect(fallbackDocument('/home')).toBe('/index.html')
    expect(fallbackDocument('/hijos')).toBe('/index.html')
    expect(fallbackDocument('/children/1')).toBe('/index.html')
  })

  it('takes only navigations of this app, never files nor /version.json', () => {
    expect(isAppNavigation(nav, new URL(`${ORIGIN}/children/1`), ORIGIN)).toBe(true)
    expect(isAppNavigation(nav, new URL(`${ORIGIN}/`), ORIGIN)).toBe(true)
    expect(isAppNavigation(nav, new URL(`${ORIGIN}/version.json`), ORIGIN)).toBe(false)
    expect(isAppNavigation(nav, new URL(`${ORIGIN}/assets/index.js`), ORIGIN)).toBe(false)
    expect(isAppNavigation({ mode: 'cors' }, new URL(`${ORIGIN}/home`), ORIGIN)).toBe(false)
    expect(isAppNavigation(nav, new URL('https://api-dev.pedi-track.com/accounts/me'), ORIGIN)).toBe(false)
  })

  it('keeps the font and nothing of the API nor of Clerk', () => {
    expect(isFontRequest(new URL('https://fonts.googleapis.com/css2?family=Figtree'))).toBe(true)
    expect(isFontRequest(new URL('https://fonts.gstatic.com/s/figtree/x.woff2'))).toBe(true)
    expect(isFontRequest(new URL('https://api-dev.pedi-track.com/accounts/me'))).toBe(false)
    expect(isFontRequest(new URL('https://wanted-panda-817.clerk.accounts.dev/v1/client'))).toBe(false)
  })

  it('asks the page by its address and gives up after the time', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = fetchWithin(`${ORIGIN}/home`, 3000, fetchFn as unknown as typeof fetch)
    const caught = pending.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await caught).toBeInstanceOf(DOMException)
    expect(fetchFn).toHaveBeenCalledWith(`${ORIGIN}/home`, expect.objectContaining({ credentials: 'same-origin' }))
    vi.useRealTimers()
  })

  it('answers what the network gives in time', async () => {
    const ok = new Response('ok')
    const fetchFn = vi.fn(async () => ok)
    await expect(fetchWithin(`${ORIGIN}/home`, 3000, fetchFn as unknown as typeof fetch)).resolves.toBe(ok)
  })
})
