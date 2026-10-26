import { describe, expect, it } from 'vitest'
import type { ConsultationDetail, Medication } from './types'
import { flagsOf, hasScheduleChange, toUpdatePayload, valuesOfDetail, versionOf } from './editValues'

function med(over: Partial<Medication> = {}): Medication {
  return {
    id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 7, startTime: '08:00', endedAt: null,
    doses: [], extendableDoses: 0, extensions: [], ...over,
  }
}

function detail(over: Partial<ConsultationDetail> = {}): ConsultationDetail {
  return {
    id: 'c1', childId: 'h1', doctorName: 'Dra. López', consultDate: '2026-10-18', photoBase64: '', notes: 'Fiebre',
    symptoms: [{ code: 'fever', name: 'Fiebre', category: 'General' }] as ConsultationDetail['symptoms'],
    medications: [med()], createdAt: '2026-10-18T15:20:00.123456Z', edited: null, ...over,
  }
}

describe('versionOf', () => {
  it('is the last edit, or the creation', () => {
    expect(versionOf(detail())).toBe('2026-10-18T15:20:00.123456Z')
    expect(versionOf(detail({ edited: { at: '2026-10-20T10:00:00.5Z', by: 'Ana' } }))).toBe('2026-10-20T10:00:00.5Z')
    expect(versionOf(detail({ createdAt: undefined }))).toBe('')
  })
})

describe('valuesOfDetail and flagsOf', () => {
  it('the saved consultation as the form values, with each medication id', () => {
    expect(valuesOfDetail(detail())).toEqual({
      doctorName: 'Dra. López', consultDate: '2026-10-18', notes: 'Fiebre', symptomCodes: ['fever'], recordOnly: false,
      medications: [{ medicationId: 'm1', name: 'Amoxicilina', frequencyHours: '8', durationDays: '7', startTime: '08:00' }],
    })
    expect(valuesOfDetail(detail({ recordOnly: true, medications: [med({ startTime: null })] })).medications[0].startTime).toBe('')
  })

  it('says which medications ended and which have marks', () => {
    const flags = flagsOf(detail({
      medications: [
        med({ id: 'a', endedAt: '2026-10-20T00:00:00Z' }),
        med({ id: 'b', doses: [{ id: 'd', scheduledAt: '', taken: true, status: 'taken' }] }),
      ],
    }))
    expect(flags).toEqual({ a: { ended: true, hasMarks: false }, b: { ended: false, hasMarks: true } })
  })
})

describe('hasScheduleChange', () => {
  const initial = valuesOfDetail(detail())

  it('no: data, a name, a new medication', () => {
    expect(hasScheduleChange(initial, { ...initial, doctorName: 'Otro', notes: 'x' })).toBe(false)
    expect(hasScheduleChange(initial, { ...initial, medications: [{ ...initial.medications[0], name: 'Otra' }] })).toBe(false)
    expect(hasScheduleChange(initial, {
      ...initial,
      medications: [...initial.medications, { name: 'Jarabe', frequencyHours: '12', durationDays: '5', startTime: '09:00' }],
    })).toBe(false)
    expect(hasScheduleChange(initial, { ...initial, medications: [{ ...initial.medications[0], frequencyHours: 'c/8 h' }] })).toBe(false)
  })

  it('yes: frequency, duration, first dose or the date', () => {
    const changed = (over: object) => ({ ...initial, medications: [{ ...initial.medications[0], ...over }] })
    expect(hasScheduleChange(initial, changed({ frequencyHours: '6' }))).toBe(true)
    expect(hasScheduleChange(initial, changed({ durationDays: '5' }))).toBe(true)
    expect(hasScheduleChange(initial, changed({ startTime: '09:00' }))).toBe(true)
    expect(hasScheduleChange(initial, { ...initial, consultDate: '2026-10-17' })).toBe(true)
  })

  it('never for a record-only consultation, nor a date change once every saved medication is gone', () => {
    const record = valuesOfDetail(detail({ recordOnly: true }))
    expect(hasScheduleChange(record, { ...record, consultDate: '2026-10-01' })).toBe(false)
    expect(hasScheduleChange(initial, {
      ...initial, consultDate: '2026-10-17',
      medications: [{ name: 'Jarabe', frequencyHours: '12', durationDays: '5', startTime: '09:00' }],
    })).toBe(false)
  })
})

describe('toUpdatePayload', () => {
  it('sends the whole consultation, the ids of the saved medications and the version', () => {
    const values = valuesOfDetail(detail())
    values.medications.push({ name: 'Jarabe', frequencyHours: 'c/12 h', durationDays: '5 días', startTime: '09:00' })
    const payload = toUpdatePayload(values, 'v1', 'abc')
    expect(payload).toMatchObject({
      expectedVersion: 'v1', doctorName: 'Dra. López', consultDate: '2026-10-18', photoBase64: 'abc', notes: 'Fiebre', symptomCodes: ['fever'],
      medications: [
        { id: 'm1', name: 'Amoxicilina', frequencyHours: 8, durationDays: 7, startTime: '08:00' },
        { name: 'Jarabe', frequencyHours: 12, durationDays: 5, startTime: '09:00' },
      ],
    })
    expect(payload.medications[1]).not.toHaveProperty('id')
    expect(typeof payload.utcOffsetMinutes).toBe('number')
  })

  it('a record-only consultation sends no start time and an unreadable number as 0', () => {
    const values = { ...valuesOfDetail(detail()), recordOnly: true }
    values.medications[0].frequencyHours = 'cada rato'
    const payload = toUpdatePayload(values, 'v1')
    expect(payload.medications[0]).toMatchObject({ startTime: null, frequencyHours: 0 })
    expect(payload.photoBase64).toBeUndefined()
  })
})
