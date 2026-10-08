import { describe, expect, it } from 'vitest'
import { everyMinutes, newRoutineValues, serverMessage, toInput, validateValues, valuesOf } from './routineValues'
import type { Routine } from './types'

const supplement = () => ({ ...newRoutineValues('supplement', new Date(2026, 9, 6)), name: 'Vitamina D', times: ['08:00'] })
const activity = () => ({
  ...newRoutineValues('activity', new Date(2026, 9, 6)),
  name: 'Tomar agua',
  windowStart: '08:00',
  windowEnd: '20:00',
  every: '1',
  unit: 'h' as const,
})

describe('newRoutineValues', () => {
  it('starts with no hour at all, from the given day, without an end', () => {
    expect(newRoutineValues('supplement', new Date(2026, 9, 6))).toMatchObject({
      kind: 'supplement',
      period: 'daily',
      times: [''],
      firstDate: '2026-10-06',
      endMode: 'none',
      name: '',
    })
    expect(newRoutineValues('activity', new Date(2026, 9, 6))).toMatchObject({ kind: 'activity', windowStart: '', windowEnd: '', every: '', unit: 'h', daysMode: 'all' })
  })
})

describe('validateValues · supplement', () => {
  it('accepts a complete one', () => {
    expect(validateValues(supplement())).toEqual({})
  })

  it('asks for a name, in its own words', () => {
    expect(validateValues({ ...supplement(), name: '   ' }).name).toBe('Escribe el nombre del suplemento.')
  })

  it('asks for the hour, and not twice the same one', () => {
    expect(validateValues({ ...supplement(), times: [''] }).times).toBe('Escribe la hora.')
    expect(validateValues({ ...supplement(), times: ['08:00', ''] }).times).toBe('Escribe la hora.')
    expect(validateValues({ ...supplement(), times: ['08:00', '08:00'] }).times).toBe('Esta hora ya está en la lista.')
  })

  it('asks for at least one weekday', () => {
    expect(validateValues({ ...supplement(), period: 'weekdays', weekdays: [] }).weekdays).toBe('Elige al menos un día.')
    expect(validateValues({ ...supplement(), period: 'weekdays', weekdays: [1] }).weekdays).toBeUndefined()
  })

  it('checks the dates', () => {
    expect(validateValues({ ...supplement(), firstDate: '' }).firstDate).toBe('Elige la fecha de la primera toma.')
    expect(validateValues({ ...supplement(), endMode: 'date', endDate: '' }).endDate).toBe('Elige la fecha de la última toma.')
    expect(validateValues({ ...supplement(), endMode: 'date', endDate: '2026-10-01' }).endDate).toBe(
      'La fecha de fin va después de la primera toma (6 oct 2026).',
    )
    expect(validateValues({ ...supplement(), endMode: 'date', endDate: '2026-10-06' })).toEqual({})
    expect(validateValues({ ...supplement(), firstDate: '', endMode: 'date', endDate: '2026-10-01' }).endDate).toBeUndefined()
  })
})

describe('validateValues · activity', () => {
  it('accepts a complete one', () => {
    expect(validateValues(activity())).toEqual({})
  })

  it('asks for a name, in its own words', () => {
    expect(validateValues({ ...activity(), name: '' }).name).toBe('Escribe el nombre de la actividad.')
  })

  it('asks for both hours, the end after the start', () => {
    expect(validateValues({ ...activity(), windowStart: '' }).windowStart).toBe('Escribe la hora en que empieza.')
    expect(validateValues({ ...activity(), windowEnd: '' }).windowEnd).toBe('Escribe la hora en que termina.')
    expect(validateValues({ ...activity(), windowEnd: '08:00' }).windowEnd).toBe('La hora de fin va después de la de inicio.')
    expect(validateValues({ ...activity(), windowEnd: '07:00' }).windowEnd).toBe('La hora de fin va después de la de inicio.')
  })

  it('asks for «cada» between 5 minutes and 23 hours', () => {
    const message = 'Elige cuánto tiempo pasa entre avisos.'
    expect(validateValues({ ...activity(), every: '' }).every).toBe(message)
    expect(validateValues({ ...activity(), every: 'ab' }).every).toBe(message)
    expect(validateValues({ ...activity(), every: '0' }).every).toBe(message)
    expect(validateValues({ ...activity(), every: '4', unit: 'min' }).every).toBe(message)
    expect(validateValues({ ...activity(), every: '5', unit: 'min' }).every).toBeUndefined()
    expect(validateValues({ ...activity(), every: '24', unit: 'h' }).every).toBe(message)
    expect(validateValues({ ...activity(), every: '23', unit: 'h' }).every).toBeUndefined()
  })

  it('asks for a day when it is on certain days', () => {
    expect(validateValues({ ...activity(), daysMode: 'some', weekdays: [] }).weekdays).toBe('Elige al menos un día.')
    expect(validateValues({ ...activity(), daysMode: 'some', weekdays: [2] }).weekdays).toBeUndefined()
    expect(validateValues({ ...activity(), daysMode: 'all', weekdays: [] }).weekdays).toBeUndefined()
  })

  it('checks the dates in its own words', () => {
    expect(validateValues({ ...activity(), firstDate: '' }).firstDate).toBe('Elige la fecha de inicio.')
    expect(validateValues({ ...activity(), endMode: 'date', endDate: '' }).endDate).toBe('Elige el último día.')
    expect(validateValues({ ...activity(), endMode: 'date', endDate: '2026-10-01' }).endDate).toBe('La fecha de fin va después de la fecha de inicio.')
  })
})

describe('everyMinutes', () => {
  it('reads «cada [n]» in minutes', () => {
    expect(everyMinutes({ every: '2', unit: 'h' })).toBe(120)
    expect(everyMinutes({ every: '45', unit: 'min' })).toBe(45)
    expect(everyMinutes({ every: ' 30 ', unit: 'min' })).toBe(30)
    expect(everyMinutes({ every: '', unit: 'h' })).toBeNull()
    expect(everyMinutes({ every: '1.5', unit: 'h' })).toBeNull()
    expect(everyMinutes({ every: '0', unit: 'h' })).toBeNull()
  })
})

describe('serverMessage', () => {
  it('says each field the server can reject, in the words of its kind', () => {
    expect(serverMessage('supplement', 'name')).toBe('Escribe el nombre del suplemento.')
    expect(serverMessage('activity', 'name')).toBe('Escribe el nombre de la actividad.')
    expect(serverMessage('supplement', 'firstDate')).toContain('primera toma')
    expect(serverMessage('activity', 'firstDate')).toContain('fecha de inicio')
    expect(serverMessage('supplement', 'endDate')).toContain('antes de la primera toma')
    expect(serverMessage('activity', 'endDate')).toContain('después de la fecha de inicio')
    expect(serverMessage('activity', 'intervalMinutes')).toBe('Elige cuánto tiempo pasa entre avisos.')
    expect(serverMessage('activity', 'windowStart')).toBeDefined()
    expect(serverMessage('activity', 'windowEnd')).toBeDefined()
    expect(serverMessage('supplement', 'times')).toBeDefined()
    expect(serverMessage('supplement', 'weekdays')).toBeDefined()
    expect(serverMessage('supplement', 'nope')).toBeUndefined()
  })
})

describe('toInput', () => {
  it('sends a supplement with only its own fields, trimmed', () => {
    const daily = toInput({ ...supplement(), name: '  Zinc ', note: ' con la cena ', period: 'daily', weekdays: [1], windowStart: '09:00' })
    expect(daily).toMatchObject({
      kind: 'supplement',
      name: 'Zinc',
      note: 'con la cena',
      period: 'daily',
      times: ['08:00'],
      weekdays: [],
      windowStart: null,
      windowEnd: null,
      intervalMinutes: null,
      endDate: null,
    })
    expect(typeof daily.utcOffsetMinutes).toBe('number')
    expect(toInput({ ...supplement(), period: 'weekdays', weekdays: [4, 0, 2] }).weekdays).toEqual([0, 2, 4])
  })

  it('sends an activity as a window in minutes, on all days or on the chosen ones', () => {
    expect(toInput(activity())).toMatchObject({ kind: 'activity', period: 'window', times: [], weekdays: [], windowStart: '08:00', windowEnd: '20:00', intervalMinutes: 60 })
    expect(toInput({ ...activity(), every: '30', unit: 'min', daysMode: 'some', weekdays: [3, 1], endMode: 'date', endDate: '2026-10-20' })).toMatchObject({
      intervalMinutes: 30,
      weekdays: [1, 3],
      endDate: '2026-10-20',
    })
    // The days of a form left on «Todos los días» are not sent even if some were toggled before.
    expect(toInput({ ...activity(), daysMode: 'all', weekdays: [1] }).weekdays).toEqual([])
  })
})

describe('valuesOf', () => {
  const routine = (over: Partial<Routine>): Routine => ({
    id: 'r', childId: 'c', kind: 'supplement', name: 'N', note: 'n', period: 'daily', times: ['09:00'], weekdays: [], windowStart: null, windowEnd: null,
    intervalMinutes: null, firstDate: '2026-10-01', endDate: null, status: 'active', pausedAt: null, endedAt: null, createdBy: 'Ana',
    createdAt: '2026-10-01T00:00:00Z', myReminders: true, canEdit: true, progress: { taken: 0, elapsed: 0, total: 0 }, doses: [], nextDose: null,
    ...over,
  })

  it('reads a supplement back into the form', () => {
    expect(valuesOf(routine({}))).toMatchObject({ kind: 'supplement', name: 'N', times: ['09:00'], endMode: 'none', daysMode: 'all' })
    expect(valuesOf(routine({ times: [] })).times).toEqual([''])
    expect(valuesOf(routine({ period: 'weekdays', weekdays: [1, 2] }))).toMatchObject({ period: 'weekdays', weekdays: [1, 2] })
  })

  it('reads an activity back, in hours when it is whole hours', () => {
    const base = { kind: 'activity' as const, period: 'window' as const, times: [], windowStart: '08:00', windowEnd: '20:00', endDate: '2026-10-20' }
    expect(valuesOf(routine({ ...base, intervalMinutes: 120 }))).toMatchObject({ kind: 'activity', windowStart: '08:00', windowEnd: '20:00', every: '2', unit: 'h', endMode: 'date', endDate: '2026-10-20' })
    expect(valuesOf(routine({ ...base, intervalMinutes: 45, weekdays: [0, 2] }))).toMatchObject({ every: '45', unit: 'min', daysMode: 'some', weekdays: [0, 2] })
    expect(valuesOf(routine({ ...base, intervalMinutes: 60, weekdays: [0, 1, 2, 3, 4, 5, 6] })).daysMode).toBe('all')
  })
})
