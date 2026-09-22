import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchConsultations, createConsultation, fetchConsultationDetail, updateDoseStatus, ConsultationApiError } from './api'

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

    expect(await fetchConsultations('child-1')).toEqual(consultations)
  })

  it('throws child_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await fetchConsultations('missing').catch((e) => e)
    expect(err).toBeInstanceOf(ConsultationApiError)
    expect(err.kind).toBe('child_not_found')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await fetchConsultations('child-1').catch((e) => e)
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

    expect(await createConsultation('child-1', { doctorName: 'Dra. López', consultDate: '2026-01-15', photoBase64: 'Zm9v', utcOffsetMinutes: 0, medications: [medicationPayload] })).toEqual(created)
  })

  it('throws child_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await createConsultation('missing', { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [medicationPayload] }).catch((e) => e)
    expect(err.kind).toBe('child_not_found')
  })

  it('throws validation_error on 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ details: [{ field: 'doctorName', message: 'required' }] }) } as Response)

    const err = await createConsultation('child-1', { doctorName: '', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [] }).catch((e) => e)
    expect(err.kind).toBe('validation_error')
    expect(err.details).toEqual([{ field: 'doctorName', message: 'required' }])
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await createConsultation('child-1', { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [medicationPayload] }).catch((e) => e)
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

    expect(await fetchConsultationDetail('c1')).toEqual(detail)
  })

  it('throws consultation_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await fetchConsultationDetail('missing').catch((e) => e)
    expect(err.kind).toBe('consultation_not_found')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await fetchConsultationDetail('c1').catch((e) => e)
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

    expect(await updateDoseStatus('c1', 'd1', true)).toEqual(dose)
  })

  it('throws dose_not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await updateDoseStatus('c1', 'missing', true).catch((e) => e)
    expect(err.kind).toBe('dose_not_found')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await updateDoseStatus('c1', 'd1', true).catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})
