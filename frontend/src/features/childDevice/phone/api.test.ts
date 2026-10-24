import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhoneApiError, deviceRequest, fetchMe, redeemLink } from './api'

afterEach(() => vi.unstubAllGlobals())

function stub(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('redeemLink', () => {
  it('sends the secret in the body only and returns the credential', async () => {
    const fn = stub(200, { credential: 'c', childId: 'x', childFirstName: 'Mateo', rotateAfter: '2026-10-30T00:00:00Z' })
    const got = await redeemLink('secreto')
    expect(got.credential).toBe('c')
    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('secreto')
    expect(init.body).toBe(JSON.stringify({ token: 'secreto' }))
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('is just no access for any failure', async () => {
    stub(404, { error: 'not_found' })
    await expect(redeemLink('x')).rejects.toMatchObject({ kind: 'no_access' })
  })
})

describe('deviceRequest', () => {
  it('uses the Device scheme, never Bearer', async () => {
    const fn = stub(200, { childId: 'x' })
    await fetchMe('cred')
    const [, init] = fn.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Device cred')
  })

  it('sends a JSON body when there is one and returns nothing for a 204', async () => {
    const fn = stub(204)
    expect(await deviceRequest('cred', '/child-device/x', 'POST', { a: 1 })).toBeUndefined()
    const [, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('401 and 403 mean the access is gone', async () => {
    for (const status of [401, 403]) {
      stub(status)
      await expect(deviceRequest('cred', '/child-device/me')).rejects.toMatchObject({ kind: 'no_access' })
    }
  })

  it('any other failure is unknown, with the server message', async () => {
    stub(500, { message: 'boom' })
    const error = await deviceRequest('cred', '/child-device/me').catch((e) => e)
    expect(error).toBeInstanceOf(PhoneApiError)
    expect(error).toMatchObject({ kind: 'unknown', message: 'boom' })
    stub(500)
    await expect(deviceRequest('cred', '/x')).rejects.toMatchObject({ kind: 'unknown' })
  })
})
