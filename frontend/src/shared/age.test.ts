import { describe, it, expect } from 'vitest'
import { computeAge } from './age'

// Built from local components (no 'Z'/UTC parsing) so the test is
// deterministic regardless of the machine's timezone — computeAge itself
// reads `now` via local accessors (see age.ts).
const NOW = new Date(2026, 8, 16, 12)

describe('computeAge', () => {
  it('returns 0 meses for a newborn', () => {
    expect(computeAge('2026-09-10', NOW)).toEqual({ value: 0, unit: 'meses' })
  })

  it('returns 1 mes for a one-month-old', () => {
    expect(computeAge('2026-08-16', NOW)).toEqual({ value: 1, unit: 'meses' })
  })

  it('returns 23 meses just under 2 years old', () => {
    expect(computeAge('2024-10-16', NOW)).toEqual({ value: 23, unit: 'meses' })
  })

  it('returns 2 años at exactly 2 years old', () => {
    expect(computeAge('2024-09-16', NOW)).toEqual({ value: 2, unit: 'años' })
  })

  it('returns 2 años a few days after turning 2', () => {
    expect(computeAge('2024-09-10', NOW)).toEqual({ value: 2, unit: 'años' })
  })

  it('returns 23 meses the day before turning 2', () => {
    expect(computeAge('2024-09-17', NOW)).toEqual({ value: 23, unit: 'meses' })
  })

  it('returns whole years for an older child', () => {
    expect(computeAge('2018-01-15', NOW)).toEqual({ value: 8, unit: 'años' })
  })

  it('does not count a birthday that has not happened yet this year', () => {
    expect(computeAge('2018-12-01', NOW)).toEqual({ value: 7, unit: 'años' })
  })

  it('clamps to 0 meses for a defensively-invalid future birth date', () => {
    expect(computeAge('2026-09-20', NOW)).toEqual({ value: 0, unit: 'meses' })
  })
})
