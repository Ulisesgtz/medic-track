import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAccount, CreateAccountError } from './api'

const basePayload = { firstName: 'Ana', lastName: 'Gómez', email: 'ana@example.com', children: [] }

describe('createAccount', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the created account on success', async () => {
    const created = { ...basePayload, id: 'abc', countryCode: null, stateCode: null, plan: 'free' }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => created } as Response)

    const result = await createAccount(basePayload)

    expect(result).toEqual(created)
  })

  it('throws validation_error on 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'bad input', details: [{ field: 'email', message: 'required' }] }),
    } as Response)

    await expect(createAccount(basePayload)).rejects.toMatchObject({
      kind: 'validation_error',
      details: [{ field: 'email', message: 'required' }],
    })
  })

  it('throws email_already_exists on 409', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Email is already in use' }),
    } as Response)

    const err = await createAccount(basePayload).catch((e) => e)
    expect(err).toBeInstanceOf(CreateAccountError)
    expect(err.kind).toBe('email_already_exists')
  })

  it('throws freemium_child_limit_exceeded on 422', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Free plan limit exceeded', limit: 1, received: 2 }),
    } as Response)

    const err = await createAccount(basePayload).catch((e) => e)
    expect(err.kind).toBe('freemium_child_limit_exceeded')
  })

  it('throws unknown for an unexpected status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'boom' }),
    } as Response)

    const err = await createAccount(basePayload).catch((e) => e)
    expect(err.kind).toBe('unknown')
  })

  it('falls back to default messages when the server omits `message`', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) } as Response)
    let err = await createAccount(basePayload).catch((e) => e)
    expect(err.message).toBe('Validation error')

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) } as Response)
    err = await createAccount(basePayload).catch((e) => e)
    expect(err.message).toBe('Email already in use')

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) } as Response)
    err = await createAccount(basePayload).catch((e) => e)
    expect(err.message).toBe('Free plan limit exceeded')

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    err = await createAccount(basePayload).catch((e) => e)
    expect(err.message).toBe('Unexpected error creating account')
  })
})
