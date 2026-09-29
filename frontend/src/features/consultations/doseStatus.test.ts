import { describe, it, expect } from 'vitest'
import { DOSE_CHIP_STYLE, DOSE_REFETCH_MS, UNREGISTERED_LABEL, isUnmarked, isUnregistered, unregisteredText } from './doseStatus'

describe('doseStatus (specs/013)', () => {
  it('"sin marcar" is what is still in time: pending or due, never taken nor unregistered', () => {
    expect(isUnmarked({ status: 'pending' })).toBe(true)
    expect(isUnmarked({ status: 'due' })).toBe(true)
    expect(isUnmarked({ status: 'taken' })).toBe(false)
    expect(isUnmarked({ status: 'unregistered' })).toBe(false)
    expect(isUnregistered({ status: 'unregistered' })).toBe(true)
    expect(isUnregistered({ status: 'due' })).toBe(false)
  })

  it('"sin registrar" has its own style: dashed, never red nor the amber of "por marcar"', () => {
    const style = DOSE_CHIP_STYLE.unregistered
    expect(style).toContain('border-dashed')
    expect(style).not.toMatch(/red|rose|pending/)
    expect(new Set(Object.values(DOSE_CHIP_STYLE)).size).toBe(4)
  })

  it('says only "sin registrar", and refreshes every minute', () => {
    expect(UNREGISTERED_LABEL).toBe('Sin registrar')
    expect(unregisteredText(1)).toBe('1 sin registrar')
    expect(unregisteredText(3)).toBe('3 sin registrar')
    expect(DOSE_REFETCH_MS).toBe(60_000)
  })
})
