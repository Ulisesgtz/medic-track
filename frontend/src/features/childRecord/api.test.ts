import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChildRecordApiError, errorFor, fetchChildRecord, saveChildRecord } from './api'
import { fullRecord } from './recordFixtures'
import { toInput, valuesOf } from './recordForm'

const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
afterEach(() => vi.unstubAllGlobals())

describe('child record api', () => {
  it('reads the record with the token and without a body', async () => {
    const mock = reply(200, fullRecord)
    vi.stubGlobal('fetch', mock)
    expect(await fetchChildRecord('c1', 'tok')).toEqual(fullRecord)
    const [url, init] = mock.mock.calls[0]
    expect(String(url)).toMatch(/\/children\/c1\/record$/)
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('saves the whole record in the BODY, never in the address', async () => {
    const mock = reply(200, fullRecord)
    vi.stubGlobal('fetch', mock)
    await saveChildRecord('c1', toInput(valuesOf(fullRecord), 3), 'tok')
    const [url, init] = mock.mock.calls[0]
    expect(String(url)).not.toContain('Penicilina')
    expect(String(url)).not.toContain('?')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toMatchObject({ expectedVersion: 3, bloodType: 'O+' })
    expect(JSON.parse(init.body).allergies[0].name).toBe('Penicilina')
  })

  it('types every failure', async () => {
    vi.stubGlobal('fetch', reply(409, { error: 'record_conflict', message: 'x', current: fullRecord }))
    const conflict = await saveChildRecord('c1', toInput(valuesOf(fullRecord), 1), null).catch((e) => e)
    expect(conflict).toBeInstanceOf(ChildRecordApiError)
    expect(conflict.kind).toBe('conflict')
    expect(conflict.current).toEqual(fullRecord)

    expect(errorFor(400, { error: 'validation_error', details: [{ field: 'a', message: 'b' }] }, 'f').details).toHaveLength(1)
    expect(errorFor(403, {}, 'f').kind).toBe('forbidden')
    expect(errorFor(404, {}, 'f').kind).toBe('not_found')
    expect(errorFor(500, {}, 'fallback')).toMatchObject({ kind: 'unknown', message: 'fallback' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('x') } }))
    await expect(fetchChildRecord('c1', null)).rejects.toMatchObject({ kind: 'unknown' })
  })
})
