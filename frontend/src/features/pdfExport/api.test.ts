import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExportApiError, fetchCardPhoto, fetchConsultationPhoto, fetchExportData } from './api'
import type { ExportRequest } from './types'

const request: ExportRequest = {
  period: { kind: 'filters', filters: { doctor: 'Dra. Laura Cázares', symptomCodes: ['fever'] } },
  sections: { consultations: true, vaccinations: true, photos: false },
}

function answer(status: number, body: unknown) {
  return vi.fn().mockImplementation(() => Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchExportData', () => {
  it('posts the criterion in the body, never in the address, with the token and the signal', async () => {
    const fetchMock = answer(200, { child: { firstName: 'Mateo' } })
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    const data = await fetchExportData('c1', request, 'tok', signal)
    expect(data.child.firstName).toBe('Mateo')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/children\/c1\/export$/)
    expect(url).not.toContain('Laura')
    expect(init.method).toBe('POST')
    expect(init.signal).toBe(signal)
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual(request)
  })

  it.each([
    [422, { error: 'freemium_consultation_limit_exceeded', reason: 'pdf_export' }, 'plan_required'],
    [422, { error: 'freemium_consultation_limit_exceeded', reason: 'history_search' }, 'unknown'],
    [400, { error: 'validation_error', details: [{ field: 'sections', message: 'x' }] }, 'validation_error'],
    [403, { error: 'forbidden' }, 'forbidden'],
    [404, { error: 'child_not_found' }, 'forbidden'],
    [500, 'not json', 'unknown'],
  ])('%i %j → %s', async (status, body, kind) => {
    vi.stubGlobal('fetch', answer(status, body))
    const error = await fetchExportData('c1', request, null).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ExportApiError)
    expect((error as ExportApiError).kind).toBe(kind)
  })
})

describe('the photos', () => {
  it('asks each photo by its own address and returns its base64', async () => {
    const fetchMock = answer(200, { photoBase64: 'abc' })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchConsultationPhoto('k1', 'tok')).resolves.toBe('abc')
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/consultations\/k1\/photo$/)
    await expect(fetchCardPhoto('c1', 'p1', 'tok')).resolves.toBe('abc')
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/children\/c1\/vaccine-card-photos\/p1$/)
  })

  it('a consultation without a photo is an empty string; a failure is an ExportApiError', async () => {
    vi.stubGlobal('fetch', answer(200, {}))
    await expect(fetchConsultationPhoto('k1', null)).resolves.toBe('')
    vi.stubGlobal('fetch', answer(403, {}))
    await expect(fetchCardPhoto('c1', 'p1', null)).rejects.toMatchObject({ kind: 'forbidden' })
  })
})
