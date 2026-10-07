import { describe, expect, it } from 'vitest'
import { newRoutineValues, toInput, validateValues, valuesOf } from './routineValues'
import type { Routine } from './types'

const base = () => ({ ...newRoutineValues(new Date(2026, 9, 6)), name: 'Vitamina D' })

describe('newRoutineValues', () => {
  it('starts daily at 08:00 from the given day, without an end', () => {
    expect(newRoutineValues(new Date(2026, 9, 6))).toMatchObject({
      period: 'daily',
      times: ['08:00'],
      firstDate: '2026-10-06',
      endMode: 'none',
      name: '',
    })
  })
})

describe('validateValues', () => {
  it('accepts a complete daily routine', () => {
    expect(validateValues(base())).toEqual({})
  })

  it('asks for a name', () => {
    expect(validateValues({ ...base(), name: '   ' }).name).toBe('Escribe el nombre de la rutina.')
  })

  it('checks the times of a daily routine', () => {
    expect(validateValues({ ...base(), times: ['08:00', ''] }).times).toBe('Escribe la hora.')
    expect(validateValues({ ...base(), times: ['08:00', '08:00'] }).times).toBe('Esta hora ya está en la lista.')
  })

  it('asks for at least one weekday', () => {
    expect(validateValues({ ...base(), period: 'weekdays', weekdays: [] }).weekdays).toBe('Elige al menos un día.')
    expect(validateValues({ ...base(), period: 'weekdays', weekdays: [1] }).weekdays).toBeUndefined()
  })

  it('checks the interval and its first time', () => {
    expect(validateValues({ ...base(), period: 'interval', everyN: '0' }).everyN).toBe('Escribe un número de 1 a 24.')
    expect(validateValues({ ...base(), period: 'interval', everyN: '25' }).everyN).toBe('Escribe un número de 1 a 24.')
    expect(validateValues({ ...base(), period: 'interval', everyN: 'ab' }).everyN).toBe('Escribe un número de 1 a 24.')
    expect(validateValues({ ...base(), period: 'interval', everyN: '8', firstTime: '' }).firstTime).toBe('Escribe la hora de la primera toma.')
    expect(validateValues({ ...base(), period: 'interval', everyN: '8' })).toEqual({})
  })

  it('checks the dates', () => {
    expect(validateValues({ ...base(), firstDate: '' }).firstDate).toBe('Elige la fecha de la primera toma.')
    expect(validateValues({ ...base(), endMode: 'date', endDate: '' }).endDate).toBe('Elige la fecha de la última toma.')
    expect(validateValues({ ...base(), endMode: 'date', endDate: '2026-10-01' }).endDate).toBe(
      'La fecha de fin va después de la primera toma (6 oct 2026).',
    )
    expect(validateValues({ ...base(), endMode: 'date', endDate: '2026-10-06' })).toEqual({})
    expect(validateValues({ ...base(), firstDate: '', endMode: 'date', endDate: '2026-10-01' }).endDate).toBeUndefined()
  })
})

describe('toInput', () => {
  it('sends only the fields of the chosen period, trimmed', () => {
    const daily = toInput({ ...base(), name: '  Zinc ', note: ' con la cena ', period: 'daily', weekdays: [1] })
    expect(daily).toMatchObject({ name: 'Zinc', note: 'con la cena', times: ['08:00'], weekdays: [], intervalHours: null, firstTime: null, endDate: null })
    expect(typeof daily.utcOffsetMinutes).toBe('number')

    const weekdays = toInput({ ...base(), period: 'weekdays', weekdays: [4, 0, 2] })
    expect(weekdays.weekdays).toEqual([0, 2, 4])

    const interval = toInput({ ...base(), period: 'interval', everyN: '8', firstTime: '06:00', endMode: 'date', endDate: '2026-10-20' })
    expect(interval).toMatchObject({ times: [], intervalHours: 8, firstTime: '06:00', endDate: '2026-10-20' })
  })
})

describe('valuesOf', () => {
  const routine = (over: Partial<Routine>): Routine => ({
    id: 'r', childId: 'c', name: 'N', note: 'n', period: 'daily', times: ['09:00'], weekdays: [], intervalHours: null,
    firstDate: '2026-10-01', firstTime: null, endDate: null, status: 'active', pausedAt: null, endedAt: null, createdBy: 'Ana',
    createdAt: '2026-10-01T00:00:00Z', myReminders: true, canEdit: true, progress: { taken: 0, elapsed: 0, total: 0 }, doses: [], nextDose: null,
    ...over,
  })

  it('reads a routine back into the form', () => {
    expect(valuesOf(routine({}))).toMatchObject({ name: 'N', times: ['09:00'], endMode: 'none', everyN: '8' })
    expect(valuesOf(routine({ period: 'interval', times: [], intervalHours: 6, firstTime: '07:30', endDate: '2026-10-20' }))).toMatchObject({
      times: ['08:00'],
      everyN: '6',
      firstTime: '07:30',
      endMode: 'date',
      endDate: '2026-10-20',
    })
  })
})
