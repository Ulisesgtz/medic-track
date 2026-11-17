import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetReload, RECENT_RELOAD_MS, rememberReload, reloadedRecently } from './reloadMemory'

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('reloadMemory', () => {
  it('is false when nothing was remembered', () => {
    expect(reloadedRecently()).toBe(false)
  })

  it('is true up to 30 s after, false after that and for a time in the future', () => {
    rememberReload(1_000_000)
    expect(reloadedRecently(1_000_000 + RECENT_RELOAD_MS)).toBe(true)
    expect(reloadedRecently(1_000_000 + RECENT_RELOAD_MS + 1)).toBe(false)
    expect(reloadedRecently(999_000)).toBe(false)
  })

  it('uses the clock by default', () => {
    rememberReload()
    expect(reloadedRecently()).toBe(true)
  })

  it('never throws when storage is not available', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => rememberReload()).not.toThrow()
    expect(reloadedRecently()).toBe(false)
  })

  it('forgets what was remembered', () => {
    rememberReload()
    forgetReload()
    expect(reloadedRecently()).toBe(false)
    expect(sessionStorage.getItem('peditrack.errorScreen.reloadedAt')).toBeNull()
  })

  it('forgetting never throws when storage is not available', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => forgetReload()).not.toThrow()
  })

  it('ignores a value that is not a number', () => {
    sessionStorage.setItem('peditrack.errorScreen.reloadedAt', 'ayer')
    expect(reloadedRecently()).toBe(false)
  })
})
