import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  declineInvitation,
  FamilyApiError,
  fetchFamily,
  invitationLink,
  previewInvitation,
  resendInvitation,
} from './api'

const answer = (status: number, body: unknown = {}) =>
  vi.mocked(fetch).mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body } as Response)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('family api', () => {
  it('reads the family with the session token', async () => {
    const family = { role: 'owner', members: [] }
    answer(200, family)
    expect(await fetchFamily('tok')).toEqual(family)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/\/family$/)
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('creates and resends an invitation, and cancels one (204 has no body)', async () => {
    answer(201, { id: 'i1', token: 't' })
    expect(await createInvitation('a@b.com', 'tutor', 'tok')).toMatchObject({ id: 'i1' })
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)).toEqual({ email: 'a@b.com', role: 'tutor' })

    answer(200, { id: 'i1', token: 't2' })
    expect(await resendInvitation('i1', 'tok')).toMatchObject({ token: 't2' })
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toMatch(/\/family\/invitations\/i1\/resend$/)

    answer(204)
    expect(await cancelInvitation('i1', 'tok')).toBeUndefined()
  })

  it('puts the invitation token in the body of preview, accept and decline, never in the address', async () => {
    answer(200, { ownerName: 'Ana' })
    await previewInvitation('SECRET', 'tok')
    answer(200, { id: 'm1' })
    await acceptInvitation('SECRET', 'tok')
    answer(204)
    await declineInvitation('SECRET', 'tok')

    for (const [url, init] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).not.toContain('SECRET')
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ token: 'SECRET' })
    }
  })

  it.each([
    [422, { error: 'freemium_consultation_limit_exceeded', reason: 'family' }, 'plan_required'],
    [422, { error: 'family_full' }, 'family_full'],
    [409, { error: 'already_member' }, 'already_member'],
    [409, { error: 'invitation_pending' }, 'invitation_pending'],
    [409, { error: 'account_required' }, 'account_required'],
    [409, { error: 'already_in_family' }, 'already_in_family'],
    [403, { error: 'forbidden' }, 'forbidden'],
    [403, { error: 'email_mismatch' }, 'email_mismatch'],
    [403, { error: 'email_not_verified' }, 'email_not_verified'],
    [404, { error: 'invitation_not_found' }, 'invitation_not_found'],
    [500, { error: 'internal_error' }, 'unknown'],
  ])('maps %i %j to %s', async (status, body, kind) => {
    answer(status, body)
    const error = await fetchFamily('tok').catch((e) => e)
    expect(error).toBeInstanceOf(FamilyApiError)
    expect(error.kind).toBe(kind)
  })

  it('keeps the field errors of a validation_error', async () => {
    answer(400, { error: 'validation_error', message: 'bad', details: [{ field: 'email', message: 'is required' }] })
    const error = await createInvitation('', 'tutor', 'tok').catch((e) => e)
    expect(error.kind).toBe('validation_error')
    expect(error.details).toEqual([{ field: 'email', message: 'is required' }])
  })

  it('survives an error answer that is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)
    const error = await fetchFamily('tok').catch((e) => e)
    expect(error.kind).toBe('unknown')
  })

  it('builds the link with the token in the fragment', () => {
    expect(invitationLink('https://app.example', 'abc')).toBe('https://app.example/familia/invitacion#abc')
  })
})
