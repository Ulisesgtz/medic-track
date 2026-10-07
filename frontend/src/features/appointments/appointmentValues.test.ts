import { describe, expect, it } from 'vitest'
import { emptyAppointmentValues, hasAppointment, toAppointmentInput, validateAppointment, valuesOfAppointment } from './appointmentValues'
import { appointment } from './appointments.test-utils'

describe('appointment values', () => {
  it('starts with nothing typed and the two default notices', () => {
    const v = emptyAppointmentValues()
    expect(hasAppointment(v)).toBe(false)
    expect(v.notices).toHaveLength(2)
    expect(hasAppointment({ ...v, time: '10:30' })).toBe(true)
    expect(hasAppointment({ ...v, date: '2026-10-09' })).toBe(true)
  })

  it('asks for both the date and the time once either is typed', () => {
    const v = emptyAppointmentValues()
    expect(validateAppointment(v, '2026-09-28')).toEqual({})
    expect(validateAppointment({ ...v, time: '10:30' }, '2026-09-28')).toEqual({ date: 'Elige la fecha de la cita.' })
    expect(validateAppointment({ ...v, date: '2026-10-09' }, '2026-09-28')).toEqual({ time: 'Escribe la hora de la cita.' })
  })

  it('does not accept a date before the consultation, but the same day is fine', () => {
    const v = { ...emptyAppointmentValues(), date: '2026-09-20', time: '10:30' }
    expect(validateAppointment(v, '2026-10-06').date).toBe('La próxima cita va después de la consulta (6 oct 2026).')
    expect(validateAppointment({ ...v, date: '2026-10-06' }, '2026-10-06')).toEqual({})
    expect(validateAppointment(v, undefined)).toEqual({})
  })

  it('sends the instant, the offset, the trimmed note and the notices as they are', () => {
    const input = toAppointmentInput({ ...emptyAppointmentValues(), date: '2026-10-09', time: '10:30', note: '  con la cartilla ' })
    expect(input.startsAt).toBe(new Date(2026, 9, 9, 10, 30).toISOString())
    expect(input.utcOffsetMinutes).toBe(-new Date(2026, 9, 9, 10, 30).getTimezoneOffset())
    expect(input.note).toBe('con la cartilla')
    expect(input.notices).toEqual([
      { kind: 'before', leadMinutes: 1440, daysBefore: null, atTime: null },
      { kind: 'before', leadMinutes: 120, daysBefore: null, atTime: null },
    ])
  })

  it('reads an appointment back into the fields without the server-only data', () => {
    const v = valuesOfAppointment(appointment())
    expect(v).toMatchObject({ date: '2026-10-09', time: '10:30', note: 'Revisión de oído; pidió la cartilla de vacunas.' })
    expect(v.notices).toHaveLength(2)
    expect(Object.keys(v.notices[0]).sort()).toEqual(['atTime', 'daysBefore', 'kind', 'leadMinutes'])
  })
})
