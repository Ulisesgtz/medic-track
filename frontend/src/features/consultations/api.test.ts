import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchConsultations, fetchChildOverview, createConsultation, fetchConsultationDetail, updateDoseStatus, ConsultationApiError } from './api'

const medicationPayload = { name: 'Amoxicilina', frequencyHours: 8, durationDays: 3, startTime: '08:00' }

describe('fetchConsultations', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the consultations list on success', async () => {
    const consultations = [{ id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-15' }]
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ childId: 'child-1', consultations } as unknown) } as Response)

    expect(await fetchConsultations('child-1', 'tok')).toEqual(consultations)
  })

  it('throws child_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await fetchConsultations('missing', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(ConsultationApiError)
    expect(err.kind).toBe('child_not_found')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await fetchConsultations('child-1', 'tok').catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})

describe('createConsultation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the created consultation on success', async () => {
    const created = { id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15', photoBase64: 'Zm9v', symptoms: '', medications: [] }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => created } as Response)

    expect(await createConsultation('child-1', { doctorName: 'Dra. López', consultDate: '2026-01-15', photoBase64: 'Zm9v', utcOffsetMinutes: 0, medications: [medicationPayload] }, 'tok')).toEqual(created)
  })

  it('throws child_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await createConsultation('missing', { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [medicationPayload] }, 'tok').catch((e) => e)
    expect(err.kind).toBe('child_not_found')
  })

  it('throws validation_error on 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ details: [{ field: 'doctorName', message: 'required' }] }) } as Response)

    const err = await createConsultation('child-1', { doctorName: '', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [] }, 'tok').catch((e) => e)
    expect(err.kind).toBe('validation_error')
    expect(err.details).toEqual([{ field: 'doctorName', message: 'required' }])
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await createConsultation('child-1', { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [medicationPayload] }, 'tok').catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})

describe('fetchConsultationDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the detail on success', async () => {
    const detail = { id: 'c1', childId: 'child-1', doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', symptoms: '', medications: [] }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => detail } as Response)

    expect(await fetchConsultationDetail('c1', 'tok')).toEqual(detail)
  })

  it('throws consultation_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await fetchConsultationDetail('missing', 'tok').catch((e) => e)
    expect(err.kind).toBe('consultation_not_found')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await fetchConsultationDetail('c1', 'tok').catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})

describe('updateDoseStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the updated dose on success', async () => {
    const dose = { id: 'd1', scheduledAt: '2026-01-15T08:00:00Z', taken: true }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => dose } as Response)

    expect(await updateDoseStatus('c1', 'd1', true, 'tok')).toEqual(dose)
  })

  it('throws dose_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await updateDoseStatus('c1', 'missing', true, 'tok').catch((e) => e)
    expect(err.kind).toBe('dose_not_found')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await updateDoseStatus('c1', 'd1', true, 'tok').catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})

describe('session token and 403', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const headersOf = (call: number) => (vi.mocked(fetch).mock.calls[call][1] as RequestInit).headers

  it('sends the session token as a Bearer header on every protected call', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ consultations: [] }) } as Response)

    await fetchConsultations('c', 'tok-1')
    await fetchChildOverview('c', new Date(0), new Date(1), 'tok-2')
    await createConsultation('c', {} as never, 'tok-3')
    await fetchConsultationDetail('k', 'tok-4')
    await updateDoseStatus('k', 'd', true, 'tok-5')

    for (const [i, tok] of ['tok-1', 'tok-2', 'tok-3', 'tok-4', 'tok-5'].entries()) {
      expect(headersOf(i)).toMatchObject({ Authorization: `Bearer ${tok}` })
    }
  })

  it('treats 403 (a resource that is not the session\'s) like not found, never revealing it exists', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) } as Response)

    expect((await fetchConsultations('c', 't').catch((e) => e)).kind).toBe('child_not_found')
    expect((await fetchChildOverview('c', new Date(0), new Date(1), 't').catch((e) => e)).kind).toBe('child_not_found')
    expect((await createConsultation('c', {} as never, 't').catch((e) => e)).kind).toBe('child_not_found')
    expect((await fetchConsultationDetail('k', 't').catch((e) => e)).kind).toBe('consultation_not_found')
    expect((await updateDoseStatus('k', 'd', true, 't').catch((e) => e)).kind).toBe('dose_not_found')
  })
})
