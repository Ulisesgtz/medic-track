import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Account, Child } from '../home/types'
import { REMINDER_CHILD_FALLBACK } from './reminderText'
import { reminderChildName, useReminderActivation } from './useReminderActivation'
import type { useReminders } from './useReminders'

const child = (id: string, firstName: string, role?: Child['role']): Child => ({ id, firstName, lastName: 'G', birthDate: '2021-01-01', height: null, weight: null, role })
const account = (patch: Partial<Account> = {}): Account => ({
  id: 'a1', firstName: 'Ana', lastName: 'G', email: 'a@e.com', countryCode: null, stateCode: null, plan: 'free',
  children: [child('c1', 'Mateo')], disclaimerVersion: 'v', disclaimerAccepted: true, reminderDetail: 'generic', ...patch,
})
const remindersMock = () => ({ activate: vi.fn(), changeDetail: vi.fn() }) as unknown as ReturnType<typeof useReminders> & { activate: ReturnType<typeof vi.fn>; changeDetail: ReturnType<typeof vi.fn> }

describe('reminderChildName', () => {
  it('is the first child of the account itself, never one shared with the person', () => {
    expect(reminderChildName(account({ children: [child('s', 'Sofía', 'caregiver'), child('c1', 'Mateo', 'owner')] }))).toBe('Mateo')
    expect(reminderChildName(account({ children: [child('c1', 'Mateo')] }))).toBe('Mateo')
  })

  it('falls back to the neutral word with none of its own', () => {
    expect(reminderChildName(account({ children: [] }))).toBe(REMINDER_CHILD_FALLBACK)
    expect(reminderChildName(account({ children: [child('s', 'Sofía', 'tutor')] }))).toBe(REMINDER_CHILD_FALLBACK)
  })
})

describe('useReminderActivation', () => {
  it('activates at once when the account already chose what the reminders show', () => {
    const reminders = remindersMock()
    const { result } = renderHook(() => useReminderActivation(account(), reminders))
    act(() => result.current.start())
    expect(reminders.activate).toHaveBeenCalledWith()
    expect(result.current.dialog).toBeNull()
  })

  it('the first time it asks, and the choice activates with it', () => {
    const reminders = remindersMock()
    const { result } = renderHook(() => useReminderActivation(account({ reminderDetail: null }), reminders))
    act(() => result.current.start())
    expect(result.current.dialog).toBe('activate')
    expect(reminders.activate).not.toHaveBeenCalled()
    act(() => result.current.choose('detailed'))
    expect(reminders.activate).toHaveBeenCalledWith('detailed')
    expect(result.current.dialog).toBeNull()
  })

  it('cancelling the choice turns nothing on', () => {
    const reminders = remindersMock()
    const { result } = renderHook(() => useReminderActivation(account({ reminderDetail: null }), reminders))
    act(() => result.current.start())
    act(() => result.current.cancel())
    expect(result.current.dialog).toBeNull()
    expect(reminders.activate).not.toHaveBeenCalled()
  })

  it('changing what they show goes to changeDetail', () => {
    const reminders = remindersMock()
    const { result } = renderHook(() => useReminderActivation(account(), reminders))
    act(() => result.current.startChange())
    expect(result.current.dialog).toBe('change')
    act(() => result.current.choose('generic'))
    expect(reminders.changeDetail).toHaveBeenCalledWith('generic')
    expect(reminders.activate).not.toHaveBeenCalled()
  })

  it('works before the account is known (nothing to ask, the neutral name)', () => {
    const reminders = remindersMock()
    const { result } = renderHook(() => useReminderActivation(undefined, reminders))
    expect(result.current.childName).toBe(REMINDER_CHILD_FALLBACK)
    act(() => result.current.start())
    expect(reminders.activate).toHaveBeenCalled()
  })
})
