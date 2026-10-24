import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeviceLinkError, createDeviceLink, deviceLinkUrl } from './parentApi'

afterEach(() => vi.unstubAllGlobals())

function stub(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('createDeviceLink', () => {
  it('posts the name in the body with the parent session', async () => {
    const fn = stub(201, { id: 'l', token: 't' })
    await createDeviceLink('c1', 'Tablet', 'clerk-token')
    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/children\/c1\/device-links$/)
    expect(init.body).toBe('{"name":"Tablet"}')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer clerk-token')
  })

  it.each([
    [422, { error: 'freemium_consultation_limit_exceeded', reason: 'child_device' }, 'plan_required'],
    [422, { error: 'child_device_limit_exceeded', limit: 3 }, 'limit'],
    [400, { error: 'validation_error' }, 'validation_error'],
    [403, {}, 'forbidden'],
    [404, {}, 'not_found'],
    [500, {}, 'unknown'],
    [422, { error: 'otra', reason: 'family' }, 'unknown'],
  ])('maps %s %j to %s', async (status, body, kind) => {
    stub(status, body)
    const error = await createDeviceLink('c1', 'x', null).catch((e) => e)
    expect(error).toBeInstanceOf(DeviceLinkError)
    expect(error.kind).toBe(kind)
  })

  it('keeps the limit the server says', async () => {
    stub(422, { error: 'child_device_limit_exceeded', limit: 3 })
    const error = await createDeviceLink('c1', 'x', null).catch((e) => e)
    expect(error.limit).toBe(3)
  })
})

describe('deviceLinkUrl', () => {
  it('puts the secret in the fragment, which a browser never sends', () => {
    expect(deviceLinkUrl('https://dev.pedi-track.com', 'abc')).toBe('https://dev.pedi-track.com/hijo#abc')
  })
})
