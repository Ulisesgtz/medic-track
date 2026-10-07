import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AppointmentApiError,
  createAppointment,
  fetchAppointment,
  fetchChildAppointments,
  fetchConsultationAppointment,
  setAppointmentReminders,
  setAppointmentStatus,
  updateAppointment,
} from './api'
import type { AppointmentInput } from './types'

const input: AppointmentInput = { startsAt: '2026-10-09T16:30:00.000Z', utcOffsetMinutes: -360, note: 'Nota secreta', notices: [] }

function stub(status: number, body: unknown) {
  const mock = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.unstubAllGlobals())

describe('requests', () => {
  it('reads with the right verbs and paths', async () => {
    const mock = stub(200, {})
    await fetchChildAppointments('c1', 'tok')
    await fetchConsultationAppointment('k1', 'tok')
    await fetchAppointment('a1', 'tok')
    expect(mock.mock.calls.map(([url, init]) => `${init.method} ${String(url).replace('http://localhost:8080', '')}`)).toEqual([
      'GET /children/c1/appointments',
      'GET /consultations/k1/appointment',
      'GET /appointments/a1',
    ])
    expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(mock.mock.calls[0][1].headers['Content-Type']).toBeUndefined()
  })

  it('sends the note only in the body, never in the address', async () => {
    const mock = stub(201, { id: 'a1' })
    await createAppointment('k1', input, 'tok')
    await updateAppointment('a1', input, 'tok')
    for (const [url, init] of mock.mock.calls) {
      expect(String(url)).not.toContain('secreta')
      expect(JSON.parse(init.body).note).toBe('Nota secreta')
    }
    expect(mock.mock.calls[0][1].method).toBe('POST')
    expect(mock.mock.calls[1][1].method).toBe('PATCH')
  })

  it('marks the status and chooses the reminders', async () => {
    const mock = stub(200, {})
    await setAppointmentStatus('a1', 'done', null)
    await setAppointmentReminders('a1', false, null)
    expect(mock.mock.calls.map(([url, init]) => `${init.method} ${String(url).replace('http://localhost:8080', '')}`)).toEqual([
      'POST /appointments/a1/status',
      'PUT /appointments/a1/my-reminders',
    ])
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({ status: 'done' })
    expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({ enabled: false })
  })
})

describe('errors', () => {
  const kindOf = async (status: number, body: unknown) => {
    stub(status, body)
    try {
      await setAppointmentStatus('a1', 'done', null)
    } catch (e) {
      expect(e).toBeInstanceOf(AppointmentApiError)
      return e as AppointmentApiError
    }
    throw new Error('did not fail')
  }

  it('maps each answer of the contract to its kind', async () => {
    expect((await kindOf(403, {})).kind).toBe('forbidden')
    expect((await kindOf(404, {})).kind).toBe('not_found')
    expect((await kindOf(409, { error: 'appointment_exists' })).kind).toBe('exists')
    expect((await kindOf(409, { error: 'appointment_closed' })).kind).toBe('closed')
    expect((await kindOf(409, { error: 'appointment_not_scheduled' })).kind).toBe('not_scheduled')
    expect((await kindOf(422, { error: 'freemium_consultation_limit_exceeded', reason: 'appointments' })).kind).toBe('plan_required')
    expect((await kindOf(422, { error: 'freemium_consultation_limit_exceeded', reason: 'supplements' })).kind).toBe('unknown')
    expect((await kindOf(500, {})).kind).toBe('unknown')
  })

  it('carries the field errors of a validation failure', async () => {
    const e = await kindOf(400, { error: 'validation_error', details: [{ field: 'startsAt', message: 'x' }] })
    expect(e.kind).toBe('validation_error')
    expect(e.details).toEqual([{ field: 'startsAt', message: 'x' }])
  })
})
