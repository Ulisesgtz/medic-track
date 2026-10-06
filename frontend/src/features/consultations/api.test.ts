import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchConsultations, fetchHistoryOptions, fetchConsultations, fetchChildOverview, createConsultation, fetchConsultationDetail, updateDoseStatus, endTreatment, extendTreatment, ConsultationApiError } from './api'

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

describe('createConsultation, free plan (specs/030)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const payload = { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [] }
  const refuse = (body: object, status = 422) =>
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status, json: async () => body } as Response)

  it('maps the 422 to the rule that applied', async () => {
    refuse({ error: 'freemium_consultation_limit_exceeded', reason: 'active_treatment', message: 'one at a time' })
    const active = await createConsultation('child-1', payload, 'tok').catch((e) => e)
    expect(active).toBeInstanceOf(ConsultationApiError)
    expect(active.kind).toBe('plan_limit_active_treatment')
    expect(active.message).toBe('one at a time')

    refuse({ error: 'freemium_consultation_limit_exceeded', reason: 'record_only', message: 'paid' })
    expect((await createConsultation('child-1', payload, 'tok').catch((e) => e)).kind).toBe('plan_limit_record_only')
  })

  it('without a reason it reads as the active treatment, and another 422 is unknown', async () => {
    refuse({ error: 'freemium_consultation_limit_exceeded' })
    const err = await createConsultation('child-1', payload, 'tok').catch((e) => e)
    expect(err.kind).toBe('plan_limit_active_treatment')
    expect(err.message).toBe('The free plan does not include this')

    refuse({ error: 'something_else' })
    expect((await createConsultation('child-1', payload, 'tok').catch((e) => e)).kind).toBe('unknown')
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
    const created = { id: 'c1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15', photoBase64: 'Zm9v', notes: '', symptoms: [], medications: [] }
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

  it('sends the notes and the marked symptoms (specs/012)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

    await createConsultation('child-1', { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, notes: 'Comió mariscos', symptomCodes: ['fever'], medications: [medicationPayload] }, 'tok')

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body).toMatchObject({ notes: 'Comió mariscos', symptomCodes: ['fever'] })
  })

  it('throws symptom_not_available when a chosen symptom was retired (specs/012 FR-010)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: 'One or more fields are invalid', details: [{ field: 'symptomCodes', message: 'symptom_not_available' }] }) } as Response)

    const err = await createConsultation('child-1', { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, symptomCodes: ['chills'], medications: [medicationPayload] }, 'tok').catch((e) => e)
    expect(err.kind).toBe('symptom_not_available')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await createConsultation('child-1', { doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', utcOffsetMinutes: 0, medications: [medicationPayload] }, 'tok').catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})

describe('endTreatment (specs/016)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the medication end route and returns the medication', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'm1', endedAt: '2026-01-15T12:00:00Z' }) } as Response)

    const med = await endTreatment('c1', 'm1', 'tok')

    expect(med.endedAt).toBe('2026-01-15T12:00:00Z')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/consultations\/c1\/medications\/m1\/end$/)
    expect(init?.method).toBe('POST')
  })

  it('maps the failures to their own kinds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)
    expect(await endTreatment('c1', 'x', 'tok').catch((e) => e.kind)).toBe('medication_not_found')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ details: [{ field: 'medicationId', message: 'nothing_to_end' }] }) } as Response)
    expect(await endTreatment('c1', 'm1', 'tok').catch((e) => e.kind)).toBe('validation_error')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    expect(await endTreatment('c1', 'm1', 'tok').catch((e) => e.kind)).toBe('unknown')
  })
})

describe('extendTreatment (specs/020)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the number to the medication extend route with the session and returns the medication', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'm1', extendableDoses: 0 }) } as Response)

    const med = await extendTreatment('c1', 'm1', 3, 'tok')

    expect(med.id).toBe('m1')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/consultations\/c1\/medications\/m1\/extend$/)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({ doses: 3 })
  })

  it('maps the failures to their own kinds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)
    expect(await extendTreatment('c1', 'x', 3, 'tok').catch((e) => e.kind)).toBe('medication_not_found')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) } as Response)
    expect(await extendTreatment('c1', 'x', 3, 'tok').catch((e) => e.kind)).toBe('medication_not_found')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ details: [{ field: 'medicationId', message: 'nothing_to_extend' }] }) } as Response)
    expect(await extendTreatment('c1', 'm1', 3, 'tok').catch((e) => e.kind)).toBe('nothing_to_extend')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ details: [{ field: 'doses', message: 'must be…' }] }) } as Response)
    expect(await extendTreatment('c1', 'm1', 99, 'tok').catch((e) => e.kind)).toBe('validation_error')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) } as Response)
    expect(await extendTreatment('c1', 'm1', 99, 'tok').catch((e) => e.kind)).toBe('validation_error')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    expect(await extendTreatment('c1', 'm1', 3, 'tok').catch((e) => e.kind)).toBe('unknown')
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
    const detail = { id: 'c1', childId: 'child-1', doctorName: 'X', consultDate: '2026-01-15', photoBase64: 'x', notes: '', symptoms: [], medications: [] }
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

describe('the history (specs/031)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const answer = (status: number, body: object) =>
    vi.mocked(fetch).mockResolvedValueOnce({ ok: status < 300, status, json: async () => body } as Response)

  it('posts the criteria in the body to the search route, with the session, and returns the consultations', async () => {
    const found = [{ id: 'c1', doctorName: 'Dra. López', consultDate: '2026-01-15', notes: '', symptomNames: [], medicationCount: 1 }]
    answer(200, { childId: 'child-1', consultations: found })

    expect(await searchConsultations('child-1', { q: 'amox', kind: 'record' }, 'tok')).toEqual(found)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/children\/child-1\/consultations\/search$/)
    expect(String(url)).not.toContain('?') // what was typed is not part of the address
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({ q: 'amox', kind: 'record' })
  })

  it('asks for the choice lists with a GET and the session', async () => {
    answer(200, { doctors: ['Dra. López'], medications: ['Paracetamol'] })

    expect(await fetchHistoryOptions('child-1', 'tok')).toEqual({ doctors: ['Dra. López'], medications: ['Paracetamol'] })

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/children\/child-1\/history-options$/)
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it.each([
    ['searchConsultations', () => searchConsultations('child-1', {}, 'tok')],
    ['fetchHistoryOptions', () => fetchHistoryOptions('child-1', 'tok')],
  ])('%s maps the failures to their own kinds', async (_name, call) => {
    answer(404, { error: 'child_not_found' })
    expect((await call().catch((e) => e)).kind).toBe('child_not_found')
    answer(403, {})
    expect((await call().catch((e) => e)).kind).toBe('child_not_found')

    answer(400, { message: 'bad', details: [{ field: 'kind', message: 'must be all, treatment or record' }] })
    const bad = await call().catch((e) => e)
    expect(bad.kind).toBe('validation_error')
    expect(bad.details).toEqual([{ field: 'kind', message: 'must be all, treatment or record' }])

    answer(400, { details: [{ field: 'symptomCodes', message: 'symptom_not_available' }] })
    expect((await call().catch((e) => e)).kind).toBe('symptom_not_available')

    answer(422, { error: 'freemium_consultation_limit_exceeded', reason: 'history_search', message: 'paid plan' })
    const plan = await call().catch((e) => e)
    expect(plan).toBeInstanceOf(ConsultationApiError)
    expect(plan.kind).toBe('plan_limit_history_search')
    expect(plan.message).toBe('paid plan')

    answer(422, { error: 'freemium_consultation_limit_exceeded', reason: 'record_only' })
    expect((await call().catch((e) => e)).kind).toBe('unknown')
    answer(500, {})
    expect((await call().catch((e) => e)).kind).toBe('unknown')
  })
})
