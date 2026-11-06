import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetReminders, rememberRemindersOn, remindersOnFor } from './deviceChoice'

describe('deviceChoice (bugfix/061)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('remembers the account reminders were turned on for, and forgets it', () => {
    expect(remindersOnFor()).toBeNull()
    rememberRemindersOn('a1')
    expect(remindersOnFor()).toBe('a1')
    forgetReminders()
    expect(remindersOnFor()).toBeNull()
  })

  it('without storage nothing breaks and nothing is remembered', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => rememberRemindersOn('a1')).not.toThrow()
    expect(() => forgetReminders()).not.toThrow()
    expect(remindersOnFor()).toBeNull()
  })
})
