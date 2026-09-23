import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { addChild, AccountApiError } from './api'

const childPayload = { firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15' }

describe('addChild', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the updated account on success', async () => {
    const account = { id: 'a1', firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'free', children: [{ ...childPayload, id: 'c1', height: null, weight: null }] }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => account } as Response)

    expect(await addChild('a1', childPayload, 'tok')).toEqual(account)
  })

  it('sends the session token in the Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

    await addChild('a1', childPayload, 'tok-123')

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-123', 'Content-Type': 'application/json' })
  })

  it('treats 403 (an account that is not the session\'s) like not_found', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) } as Response)

    const err = await addChild('other', childPayload, 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(AccountApiError)
    expect(err.kind).toBe('not_found')
  })

  it('throws not_found on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response)

    const err = await addChild('missing', childPayload, 'tok').catch((e) => e)
    expect(err.kind).toBe('not_found')
    expect(err.message).toBe('Account not found')
  })

  it('throws validation_error on 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false, status: 400,
      json: async () => ({ message: 'bad input', details: [{ field: 'firstName', message: 'required' }] }),
    } as Response)

    const err = await addChild('a1', childPayload, 'tok').catch((e) => e)
    expect(err.kind).toBe('validation_error')
    expect(err.details).toEqual([{ field: 'firstName', message: 'required' }])
  })

  it('throws freemium_child_limit_exceeded on 422', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) } as Response)

    const err = await addChild('a1', childPayload, 'tok').catch((e) => e)
    expect(err.kind).toBe('freemium_child_limit_exceeded')
    expect(err.message).toBe('Free plan limit exceeded')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)

    const err = await addChild('a1', childPayload, 'tok').catch((e) => e)
    expect(err.kind).toBe('unknown')
  })
})
