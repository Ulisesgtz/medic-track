import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPendingInvitation, readPendingInvitation, savePendingInvitation, tokenFromHash } from './pendingInvitation'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('pendingInvitation', () => {
  it('keeps the token for the way back and forgets it', () => {
    expect(readPendingInvitation()).toBeNull()
    savePendingInvitation('abc')
    expect(readPendingInvitation()).toBe('abc')
    clearPendingInvitation()
    expect(readPendingInvitation()).toBeNull()
  })

  it('works without storage: blocked storage never throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => savePendingInvitation('abc')).not.toThrow()
    expect(readPendingInvitation()).toBeNull()
    expect(() => clearPendingInvitation()).not.toThrow()
  })

  it('reads the token from the hash with or without the #', () => {
    expect(tokenFromHash('#abc')).toBe('abc')
    expect(tokenFromHash('abc')).toBe('abc')
    expect(tokenFromHash('')).toBe('')
  })
})
