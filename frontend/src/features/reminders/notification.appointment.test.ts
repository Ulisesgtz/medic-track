import { describe, expect, it } from 'vitest'
import { buildNotification, parsePayload, targetUrl, type ReminderPayload } from './notification'

// specs/033, part 2: a next appointment's reminder has no dose and no "Tomada" action; it points at its consultation.

const start = new Date(2026, 9, 9, 10, 30)
const appointment = (extra: Partial<ReminderPayload> = {}): ReminderPayload => ({
  kind: 'detailed',
  doseId: '',
  source: 'appointment',
  appointmentId: 'ap1',
  consultationId: 'c1',
  leadMinutes: 120,
  scheduledAt: start.toISOString(),
  child: 'Mateo',
  doctor: 'Dra. López',
  note: 'Llevar la cartilla',
  ...extra,
})
const at = (y: number, m: number, d: number, h = 8) => new Date(y, m, d, h, 0)

describe('an appointment reminder', () => {
  it('is accepted without a dose id as long as it has an appointment', () => {
    expect(parsePayload(() => appointment())).toEqual(appointment())
    expect(parsePayload(() => ({ kind: 'generic', source: 'appointment', scheduledAt: start.toISOString() }))).toBeNull()
  })

  it('opens its consultation', () => {
    expect(targetUrl(appointment())).toBe('/consultations/c1')
  })

  it('with detail says the child, the doctor, the hour and the note, and how soon on the same day', () => {
    const n = buildNotification(appointment(), at(2026, 9, 9, 8))
    expect(n.title).toBe('Cita de Mateo: hoy a las 10:30')
    expect(n.options.body).toBe('Con Dra. López, en 2 horas. Nota: Llevar la cartilla')
    expect(n.options.tag).toBe('appointment-ap1-120')
    expect(n.options.actions).toBeUndefined()
  })

  it('names the day when it is not today, and leaves out what was not written', () => {
    const tomorrow = buildNotification(appointment({ doctor: undefined, note: undefined, leadMinutes: 1440 }), at(2026, 9, 8, 10))
    expect(tomorrow.title).toBe('Cita de Mateo: mañana a las 10:30')
    expect(tomorrow.options.body).toBe('mañana.')
    const far = buildNotification(appointment({ leadMinutes: 2880 }), at(2026, 9, 7, 10))
    expect(far.title).toContain('el ')
    expect(far.title).toContain('9')
  })

  it('in generic mode carries no child, doctor, exact time or note', () => {
    const n = buildNotification(appointment({ kind: 'generic', child: undefined, doctor: undefined, note: undefined }), at(2026, 9, 9, 8))
    expect(n.title).toBe('Recordatorio de cita')
    expect(n.options.body).toBe('Hay una cita registrada para hoy, en 2 horas.')
    expect(n.options.body).not.toMatch(/10:30|Mateo|López|cartilla/)
    expect(buildNotification(appointment({ kind: 'generic', leadMinutes: 1440 }), at(2026, 9, 8, 10)).options.body).toBe('Hay una cita registrada para mañana.')
  })

  it('says the lead in days, hours or minutes, in the singular when it is one', () => {
    const body = (leadMinutes: number) => buildNotification(appointment({ kind: 'generic', leadMinutes }), at(2026, 9, 9, 9)).options.body
    expect(body(60)).toBe('Hay una cita registrada para hoy, en 1 hora.')
    expect(body(45)).toBe('Hay una cita registrada para hoy, en 45 minutos.')
    expect(body(1)).toBe('Hay una cita registrada para hoy, en 1 minuto.')
    expect(body(190)).toBe('Hay una cita registrada para hoy, en 3 h 10 min.')
    expect(body(2880)).toBe('Hay una cita registrada para hoy, en 2 días.')
    expect(body(1440)).toBe('Hay una cita registrada para hoy, en 1 día.')
  })

  it('without a lead on the same day only says today', () => {
    expect(buildNotification(appointment({ kind: 'generic', leadMinutes: undefined }), at(2026, 9, 9, 9)).options.body).toBe('Hay una cita registrada para hoy.')
  })
})
