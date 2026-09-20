import { describe, it, expect } from 'vitest'
import { formatDateLong, formatDateShort, formatDayMonth, formatTime, localDayRange } from './date'

describe('formatDateShort', () => {
  it('formats YYYY-MM-DD as "15 sep 2026", keeping the leading zero on the day', () => {
    expect(formatDateShort('2026-09-15')).toBe('15 sep 2026')
    expect(formatDateShort('2026-01-05')).toBe('05 ene 2026')
    expect(formatDateShort('2025-12-31')).toBe('31 dic 2025')
  })

  it('leaves anything that is not a date untouched', () => {
    expect(formatDateShort('pronto')).toBe('pronto')
    expect(formatDateShort('2026-13-01')).toBe('2026-13-01')
  })
})

describe('local time helpers', () => {
  it('formats the local wall-clock time as HH:MM with zero padding', () => {
    expect(formatTime(new Date(2026, 8, 18, 8, 5))).toBe('08:05')
    expect(formatTime(new Date(2026, 8, 18, 21, 0).toISOString())).toBe('21:00')
  })

  it('formats the local day and month', () => {
    expect(formatDayMonth(new Date(2026, 8, 3, 12))).toBe('03 sep')
    expect(formatDayMonth(new Date(2026, 8, 23, 23, 59).toISOString())).toBe('23 sep')
  })

  it('returns the local day as [midnight, next midnight)', () => {
    const { from, to } = localDayRange(new Date(2026, 8, 18, 16, 30))
    expect(from).toEqual(new Date(2026, 8, 18))
    expect(to).toEqual(new Date(2026, 8, 19))
  })
})

describe('formatDateLong', () => {
  it('formats YYYY-MM-DD as "12 septiembre 2026", with no leading zero on the day', () => {
    expect(formatDateLong('2026-09-12')).toBe('12 septiembre 2026')
    expect(formatDateLong('2026-01-05')).toBe('5 enero 2026')
    expect(formatDateLong('2025-12-31')).toBe('31 diciembre 2025')
  })

  it('leaves anything that is not a date untouched', () => {
    expect(formatDateLong('pronto')).toBe('pronto')
    expect(formatDateLong('2026-13-01')).toBe('2026-13-01')
  })
})
