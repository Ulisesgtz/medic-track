import { describe, it, expect, afterEach } from 'vitest'
import { useAccountSession } from './useAccountSession'

describe('useAccountSession', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('sets, gets and clears the account id', () => {
    const { getAccountId, setAccountId, clearAccountId } = useAccountSession()

    expect(getAccountId()).toBeNull()

    setAccountId('account-1')
    expect(getAccountId()).toBe('account-1')

    clearAccountId()
    expect(getAccountId()).toBeNull()
  })

  it('degrades to a no-op instead of throwing when localStorage is unavailable (Caso Límite)', () => {
    const original = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked by private browsing')
      },
    })

    const { getAccountId, setAccountId, clearAccountId } = useAccountSession()

    expect(() => setAccountId('account-1')).not.toThrow()
    expect(getAccountId()).toBeNull()
    expect(() => clearAccountId()).not.toThrow()

    Object.defineProperty(window, 'localStorage', { configurable: true, value: original })
  })
})
