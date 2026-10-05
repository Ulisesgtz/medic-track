import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCountries, fetchStates, fetchSymptoms } from './api'

describe('catalog api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchCountries throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)

    await expect(fetchCountries()).rejects.toThrow('Failed to fetch countries: 500')
  })

  it('fetchStates returns [] on 404 (country without subdivisions)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response)

    await expect(fetchStates('US')).resolves.toEqual([])
  })

  it('fetchSymptoms returns the catalog, and throws when the response is not ok', async () => {
    const symptoms = [{ code: 'fever', name: 'Fiebre', category: 'General' }]
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => symptoms } as Response)
    await expect(fetchSymptoms()).resolves.toEqual(symptoms)
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/catalog\/symptoms$/)

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    await expect(fetchSymptoms()).rejects.toThrow('Failed to fetch symptoms: 500')
  })

  it('fetchStates throws on a non-404 error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)

    await expect(fetchStates('MX')).rejects.toThrow('Failed to fetch states: 500')
  })
})
