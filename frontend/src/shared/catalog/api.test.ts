import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCountries, fetchStates } from './api'

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

  it('fetchStates throws on a non-404 error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response)

    await expect(fetchStates('MX')).rejects.toThrow('Failed to fetch states: 500')
  })
})
