import { describe, expect, it } from 'vitest'
import { emptyAppointmentValues, hasAppointment, isHttpsLink, toAppointmentInput, validateAppointment, valuesOfAppointment } from './appointmentValues'
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

describe('doctor, place and link (specs/044)', () => {
  const typed = { ...emptyAppointmentValues(), date: '2026-10-09', time: '10:30' }

  it('only accepts https links with a host', () => {
    expect(isHttpsLink('https://maps.app.goo.gl/abc')).toBe(true)
    expect(isHttpsLink('  https://www.google.com/maps/place/x  ')).toBe(true)
    for (const bad of ['javascript:alert(1)', 'http://maps.google.com', 'maps.google.com', 'https://', 'ftp://x.com', '']) expect(isHttpsLink(bad)).toBe(false)
  })

  it('refuses a link that is not https, lets it be empty, and asks for the doctor only when told to', () => {
    expect(validateAppointment({ ...typed, locationUrl: 'http://x.com' }, undefined).locationUrl).toBe('La liga debe empezar con https://')
    expect(validateAppointment({ ...typed, locationUrl: '' }, undefined).locationUrl).toBeUndefined()
    expect(validateAppointment(typed, undefined).doctor).toBeUndefined()
    expect(validateAppointment({ ...typed, doctor: '  ' }, undefined, true).doctor).toBe('Escribe con quién es la cita.')
    expect(validateAppointment({ ...typed, doctor: 'Dra. Pérez' }, undefined, true).doctor).toBeUndefined()
  })

  it('sends the doctor, the place and the link trimmed, and fills them back from an appointment (the doctor only without consultation)', () => {
    const input = toAppointmentInput({ ...typed, doctor: ' Dra. Pérez ', location: ' Consultorio 302 ', locationUrl: ' https://maps.app.goo.gl/abc ' })
    expect(input).toMatchObject({ doctor: 'Dra. Pérez', location: 'Consultorio 302', locationUrl: 'https://maps.app.goo.gl/abc' })
    const own = valuesOfAppointment(appointment({ consultationId: null, doctorName: 'Dra. Pérez', location: 'Clínica', locationUrl: 'https://x.com/y' }))
    expect(own).toMatchObject({ doctor: 'Dra. Pérez', location: 'Clínica', locationUrl: 'https://x.com/y' })
    expect(valuesOfAppointment(appointment({ doctorName: 'Dra. López' })).doctor).toBe('')
  })
})
