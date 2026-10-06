import { describe, it, expect } from 'vitest'
import { DOSE_CHIP_STYLE, canUnmarkDose, DOSE_REFETCH_MS, UNREGISTERED_LABEL, isUnmarked, isUnregistered, statusOf, takenByText, unregisteredText } from './doseStatus'

const at = { taken: false, scheduledAt: '2026-01-15T08:00:00Z' }

describe('doseStatus (specs/013)', () => {
  it('"sin marcar" is what is still in time: pending or due, never taken nor unregistered', () => {
    expect(isUnmarked({ ...at, status: 'pending' })).toBe(true)
    expect(isUnmarked({ ...at, status: 'due' })).toBe(true)
    expect(isUnmarked({ ...at, status: 'taken' })).toBe(false)
    expect(isUnmarked({ ...at, status: 'unregistered' })).toBe(false)
    expect(isUnregistered({ ...at, status: 'unregistered' })).toBe(true)
    expect(isUnregistered({ ...at, status: 'due' })).toBe(false)
  })

  it('"sin registrar" has its own style: dashed, never red nor the amber of "por marcar"', () => {
    const style = DOSE_CHIP_STYLE.unregistered
    expect(style).toContain('border-dashed')
    expect(style).not.toMatch(/red|rose|pending/)
    expect(new Set(Object.values(DOSE_CHIP_STYLE)).size).toBe(5)
  })

  it('without a status from the server (an older backend) it falls back to taken, pending or due', () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    const future = new Date(Date.now() + 3_600_000).toISOString()
    expect(statusOf({ taken: true, scheduledAt: past })).toBe('taken')
    expect(statusOf({ taken: false, scheduledAt: future })).toBe('pending')
    expect(statusOf({ taken: false, scheduledAt: past })).toBe('due')
    expect(statusOf({ taken: false, scheduledAt: past, status: 'unregistered' })).toBe('unregistered')
    expect(isUnmarked({ taken: false, scheduledAt: past })).toBe(true)
  })

  it('says only "sin registrar", and refreshes every minute', () => {
    expect(UNREGISTERED_LABEL).toBe('Sin registrar')
    expect(unregisteredText(1)).toBe('1 sin registrar')
    expect(unregisteredText(3)).toBe('3 sin registrar')
    expect(DOSE_REFETCH_MS).toBe(60_000)
  })
})

describe('canUnmarkDose (specs/032)', () => {
  it('lets anybody mark an unmarked dose, who can do everything take any mark back, and the rest only their own', () => {
    expect(canUnmarkDose({ taken: false }, false)).toBe(true)
    expect(canUnmarkDose({ taken: true, takenBy: { mine: false } }, true)).toBe(true)
    expect(canUnmarkDose({ taken: true, takenBy: { mine: true } }, false)).toBe(true)
    expect(canUnmarkDose({ taken: true, takenBy: { mine: false } }, false)).toBe(false)
    expect(canUnmarkDose({ taken: true, takenBy: null }, false)).toBe(false)
    expect(canUnmarkDose({ taken: true }, false)).toBe(false)
  })
})

describe('takenByText (specs/032)', () => {
  it('says who and at what local time, only a record', () => {
    expect(takenByText({ name: 'Ana', at: new Date(2026, 9, 1, 8, 5).toISOString() })).toBe('por Ana, 08:05')
  })

  it('is empty when nobody is known', () => {
    expect(takenByText(null)).toBe('')
    expect(takenByText(undefined)).toBe('')
  })
})
