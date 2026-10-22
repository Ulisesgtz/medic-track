import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VaccinationApiError,
  createVaccination,
  deletePhoto,
  deleteVaccination,
  fetchPhoto,
  fetchPhotos,
  fetchVaccinations,
  updateVaccination,
  uploadPhoto,
} from './api'
import type { VaccinationInput } from './types'

function reply(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

const input: VaccinationInput = { vaccineCode: '', customName: 'Vacuna privada', appliedOn: '2024-05-01', doseNumber: 1, lot: 'LOTE-1', place: 'Centro', notes: 'Nota' }

describe('the doses', () => {
  it('reads them with the token and nothing but the ids in the address', async () => {
    const fn = reply(200, { vaccinations: [] })
    await expect(fetchVaccinations('c1', 'tok')).resolves.toEqual({ vaccinations: [] })
    const [url, init] = fn.mock.calls[0]
    expect(String(url)).toMatch(/\/children\/c1\/vaccinations$/)
    expect(init.method).toBe('GET')
    expect(JSON.stringify(init.headers)).toContain('tok')
    expect(init.body).toBeUndefined()
  })

  it('what the parent typed travels only in the body, never in the address', async () => {
    const created = reply(201, { id: 'd1' })
    await createVaccination('c1', input, null)
    expect(String(created.mock.calls[0][0])).not.toMatch(/privada|LOTE|Centro|Nota/)
    expect(JSON.parse(created.mock.calls[0][1].body)).toMatchObject({ customName: 'Vacuna privada', lot: 'LOTE-1', place: 'Centro', notes: 'Nota' })

    const updated = reply(200, { id: 'd1' })
    await updateVaccination('c1', 'd1', input, null)
    expect(updated.mock.calls[0][1].method).toBe('PATCH')
    expect(String(updated.mock.calls[0][0])).toMatch(/\/children\/c1\/vaccinations\/d1$/)
    expect(String(updated.mock.calls[0][0])).not.toMatch(/privada/)
  })

  it('deleting answers 204 with no body', async () => {
    const fn = reply(204, undefined)
    fn.mockResolvedValue({ ok: true, status: 204, json: async () => Promise.reject(new Error('no body')) })
    await expect(deleteVaccination('c1', 'd1', null)).resolves.toBeUndefined()
    expect(fn.mock.calls[0][1].method).toBe('DELETE')
  })
})

describe('the photos', () => {
  it('lists without images, opens one and uploads and deletes', async () => {
    reply(200, { photos: [], limit: 10 })
    await expect(fetchPhotos('c1', null)).resolves.toEqual({ photos: [], limit: 10 })
    const one = reply(200, { id: 'p1', photoBase64: 'AAAA' })
    await expect(fetchPhoto('c1', 'p1', null)).resolves.toEqual({ id: 'p1', photoBase64: 'AAAA' })
    expect(String(one.mock.calls[0][0])).toMatch(/\/children\/c1\/vaccine-card-photos\/p1$/)

    const up = reply(201, { id: 'p2', createdAt: 'x', createdByName: 'Ana' })
    await uploadPhoto('c1', 'BBBB', null)
    expect(JSON.parse(up.mock.calls[0][1].body)).toEqual({ photoBase64: 'BBBB' })
    expect(String(up.mock.calls[0][0])).not.toMatch(/BBBB/)

    const del = reply(204, undefined)
    del.mockResolvedValue({ ok: true, status: 204, json: async () => Promise.reject(new Error('no body')) })
    await expect(deletePhoto('c1', 'p2', null)).resolves.toBeUndefined()
  })
})

describe('the failures', () => {
  async function failure(status: number, body: unknown): Promise<VaccinationApiError> {
    reply(status, body)
    return createVaccination('c1', input, null).then(
      () => {
        throw new Error('should have failed')
      },
      (e: VaccinationApiError) => e,
    )
  }

  it('tells apart a field error, a duplicate, the photo limit, a missing one, a forbidden one and anything else', async () => {
    const v = await failure(400, { error: 'validation_error', message: 'x', details: [{ field: 'appliedOn', message: 'm' }] })
    expect(v.kind).toBe('validation_error')
    expect(v.details).toEqual([{ field: 'appliedOn', message: 'm' }])
    expect((await failure(409, { error: 'duplicate_vaccination' })).kind).toBe('duplicate')
    expect((await failure(422, { error: 'photo_limit_exceeded', reason: 'vaccine_card' })).kind).toBe('photo_limit')
    expect((await failure(404, {})).kind).toBe('not_found')
    expect((await failure(403, {})).kind).toBe('forbidden')
    expect((await failure(500, {})).kind).toBe('unknown')
    expect((await failure(409, { error: 'other' })).kind).toBe('unknown')
  })

  it('an unreadable error body still becomes an error', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => Promise.reject(new Error('html')) })
    vi.stubGlobal('fetch', fn)
    await expect(createVaccination('c1', input, null)).rejects.toMatchObject({ kind: 'unknown' })
  })
})
