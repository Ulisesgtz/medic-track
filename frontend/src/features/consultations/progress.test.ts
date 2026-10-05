import { describe, it, expect } from 'vitest'
import { medicationProgress, progressText, unregisteredSuffix } from './progress'
import type { Dose } from './types'

const dose = (taken: boolean, status: Dose['status'] = taken ? 'taken' : 'due'): Dose => ({
  id: Math.random().toString(),
  scheduledAt: '2026-01-15T08:00:00Z',
  taken,
  status,
})

describe('medicationProgress (specs/014)', () => {
  it('counts what was marked out of all the doses', () => {
    expect(medicationProgress([dose(true), dose(true), dose(false, 'pending'), dose(false, 'due')])).toEqual({
      taken: 2,
      total: 4,
      unregistered: 0,
    })
  })

  it('tells doses "sin registrar" apart and never counts them as progress', () => {
    const p = medicationProgress([dose(true), dose(false, 'unregistered'), dose(false, 'unregistered'), dose(false, 'pending')])
    expect(p).toEqual({ taken: 1, total: 4, unregistered: 2 })
  })

  it('handles none, all and a single dose', () => {
    expect(medicationProgress([])).toEqual({ taken: 0, total: 0, unregistered: 0 })
    expect(medicationProgress([dose(true), dose(true)])).toEqual({ taken: 2, total: 2, unregistered: 0 })
    expect(progressText({ taken: 0, total: 1 })).toBe('0 / 1 toma')
    expect(progressText({ taken: 1, total: 1 })).toBe('1 / 1 toma')
    expect(progressText({ taken: 3, total: 9 })).toBe('3 / 9 tomas')
  })

  it('leaves the doses canceled by ending the treatment out of the total (specs/016)', () => {
    const p = medicationProgress([dose(true), dose(false, 'unregistered'), dose(false, 'canceled'), dose(false, 'canceled')])
    expect(p).toEqual({ taken: 1, total: 2, unregistered: 1 })
  })

  it('mentions the unregistered doses only when there are', () => {
    expect(unregisteredSuffix(0)).toBe('')
    expect(unregisteredSuffix(2)).toBe(' · 2 sin registrar')
  })
})
