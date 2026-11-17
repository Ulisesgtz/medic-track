import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AccountApiError } from '../home/api'
import { setFirstUseGuide } from './api'

describe('setFirstUseGuide', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('puts dismissed with the session token and returns the state', async () => {
    const state = { dismissed: true, firstConsultation: null }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => state } as Response)

    expect(await setFirstUseGuide('a1', true, 'tok')).toEqual(state)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/accounts\/a1\/first-use-guide$/)
    expect((init as RequestInit).method).toBe('PUT')
    expect((init as RequestInit).body).toBe('{"dismissed":true}')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it.each([403, 404])('maps %i to not_found', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status, json: async () => ({}) } as Response)
    const err = await setFirstUseGuide('a1', false, 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(AccountApiError)
    expect(err.kind).toBe('not_found')
  })

  it('maps 400 to validation_error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: 'bad' }) } as Response)
    const err = await setFirstUseGuide('a1', false, 'tok').catch((e) => e)
    expect(err.kind).toBe('validation_error')
  })

  it('maps anything else to unknown, even when the body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)
    const err = await setFirstUseGuide('a1', false, 'tok').catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})
