import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCredential, readCredential, writeCredential } from './storage'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('the child phone storage', () => {
  it('keeps one credential under its own key and forgets it', () => {
    expect(readCredential()).toBeNull()
    expect(writeCredential('abc')).toBe(true)
    expect(readCredential()).toBe('abc')
    expect(window.localStorage.getItem('hijo-credencial')).toBe('abc')
    clearCredential()
    expect(readCredential()).toBeNull()
  })

  it('works without storage: it reads nothing, says it could not write and does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readCredential()).toBeNull()
    expect(writeCredential('abc')).toBe(false)
    expect(() => clearCredential()).not.toThrow()
  })
})
