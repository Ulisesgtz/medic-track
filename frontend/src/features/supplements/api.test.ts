import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SupplementApiError,
  createRoutine,
  fetchRoutine,
  fetchRoutines,
  finishRoutine,
  pauseRoutine,
  resumeRoutine,
  setMyReminders,
  updateRoutine,
  updateRoutineDose,
} from './api'
import type { RoutineInput } from './types'

const input: RoutineInput = {
  name: 'Secreto',
  note: 'Nota secreta',
  period: 'daily',
  times: ['08:00'],
  weekdays: [],
  intervalHours: null,
  firstDate: '2026-10-06',
  firstTime: null,
  endDate: null,
  utcOffsetMinutes: -360,
}

function stub(status: number, body: unknown) {
  const mock = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.unstubAllGlobals())

describe('requests', () => {
  it('asks for the routines of a child and of one routine with the window in the address', async () => {
    const mock = stub(200, { routines: [] })
    const from = new Date('2026-10-06T00:00:00Z')
    const to = new Date('2026-10-07T00:00:00Z')
    await fetchRoutines('c1', from, to, 'tok')
    expect(String(mock.mock.calls[0][0])).toContain('/children/c1/routines?from=2026-10-06T00%3A00%3A00.000Z&to=2026-10-07T00%3A00%3A00.000Z')
    expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    await fetchRoutine('r1', from, to, 'tok')
    expect(String(mock.mock.calls[1][0])).toContain('/routines/r1?from=')
  })

  it('sends what the parent wrote only in the body, never in the address', async () => {
    const mock = stub(201, { id: 'r1' })
    await createRoutine('c1', input, 'tok')
    await updateRoutine('r1', input, 'tok')
    for (const [url, init] of mock.mock.calls) {
      expect(String(url)).not.toContain('Secreto')
      expect(String(url)).not.toContain('secreta')
      expect(JSON.parse(init.body).name).toBe('Secreto')
    }
    expect(mock.mock.calls[0][1].method).toBe('POST')
    expect(mock.mock.calls[1][1].method).toBe('PATCH')
  })

  it('pauses, resumes, finishes, chooses reminders and marks doses with the right verbs', async () => {
    const mock = stub(200, {})
    await pauseRoutine('r1', null)
    await resumeRoutine('r1', -360, null)
    await finishRoutine('r1', null)
    await setMyReminders('r1', false, null)
    await updateRoutineDose('r1', 'd1', true, null)
    expect(mock.mock.calls.map(([url, init]) => `${init.method} ${String(url).replace('http://localhost:8080', '')}`)).toEqual([
      'POST /routines/r1/pause',
      'POST /routines/r1/resume',
      'POST /routines/r1/finish',
      'PUT /routines/r1/my-reminders',
      'PATCH /routines/r1/doses/d1',
    ])
    expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({ utcOffsetMinutes: -360 })
    expect(JSON.parse(mock.mock.calls[3][1].body)).toEqual({ enabled: false })
    expect(mock.mock.calls[0][1].headers['Content-Type']).toBeUndefined()
  })
})

describe('errors', () => {
  const kindOf = async (status: number, body: unknown) => {
    stub(status, body)
    try {
      await pauseRoutine('r1', null)
    } catch (e) {
      expect(e).toBeInstanceOf(SupplementApiError)
      return e as SupplementApiError
    }
    throw new Error('did not fail')
  }

  it('maps each answer of the contract to its kind', async () => {
    expect((await kindOf(403, { error: 'forbidden' })).kind).toBe('forbidden')
    expect((await kindOf(404, { error: 'routine_not_found' })).kind).toBe('routine_not_found')
    expect((await kindOf(404, { error: 'dose_not_found' })).kind).toBe('dose_not_found')
    expect((await kindOf(404, { error: 'child_not_found' })).kind).toBe('child_not_found')
    expect((await kindOf(409, { error: 'routine_ended' })).kind).toBe('routine_ended')
    expect((await kindOf(409, { error: 'routine_not_active' })).kind).toBe('routine_not_active')
    expect((await kindOf(500, {})).kind).toBe('unknown')
  })

  it('carries the field errors of a validation failure', async () => {
    const e = await kindOf(400, { error: 'validation_error', message: 'bad', details: [{ field: 'name', message: 'x' }] })
    expect(e.kind).toBe('validation_error')
    expect(e.details).toEqual([{ field: 'name', message: 'x' }])
  })

  it('tells the plan from the cap', async () => {
    expect((await kindOf(422, { error: 'freemium_consultation_limit_exceeded', reason: 'supplements' })).kind).toBe('plan_required')
    const cap = await kindOf(422, { error: 'routine_limit_exceeded', limit: 10 })
    expect(cap.kind).toBe('routine_limit')
    expect(cap.limit).toBe(10)
    expect((await kindOf(422, { error: 'freemium_consultation_limit_exceeded', reason: 'history_search' })).kind).toBe('unknown')
  })
})
