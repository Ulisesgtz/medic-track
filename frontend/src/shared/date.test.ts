import { describe, it, expect } from 'vitest'
import { formatDateShort } from './date'

describe('formatDateShort', () => {
  it('formats YYYY-MM-DD as "15 sep 2026" without a leading zero on the day', () => {
    expect(formatDateShort('2026-09-15')).toBe('15 sep 2026')
    expect(formatDateShort('2026-01-05')).toBe('5 ene 2026')
    expect(formatDateShort('2025-12-31')).toBe('31 dic 2025')
  })

  it('leaves anything that is not a date untouched', () => {
    expect(formatDateShort('pronto')).toBe('pronto')
    expect(formatDateShort('2026-13-01')).toBe('2026-13-01')
  })
})
