import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionApiError, cancelSubscription, fetchSubscription, startSubscription } from './api'

// specs/045: the three calls of the subscription and how each failure is told apart.

function reply(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('the subscription calls', () => {
  it('reads the state with the session token and nothing but the account id in the address', async () => {
    const fn = reply(200, { available: true })
    expect(await fetchSubscription('a1', 'tok')).toEqual({ available: true })
    const [url, init] = fn.mock.calls[0]
    expect(String(url)).toMatch(/\/accounts\/a1\/subscription$/)
    expect(init.method).toBe('GET')
    expect(JSON.stringify(init.headers)).toContain('tok')
    expect(init.body).toBeUndefined()
  })

  it('starts the payment and cancels the renewal with a POST each', async () => {
    const start = reply(201, { checkoutUrl: 'https://pay.example/x', status: 'pending' })
    expect((await startSubscription('a1', null)).checkoutUrl).toBe('https://pay.example/x')
    expect(start.mock.calls[0][1].method).toBe('POST')
    expect(String(start.mock.calls[0][0])).toMatch(/\/accounts\/a1\/subscription$/)

    const cancel = reply(200, { available: true })
    await cancelSubscription('a1', null)
    expect(String(cancel.mock.calls[0][0])).toMatch(/\/accounts\/a1\/subscription\/cancel$/)
  })
})

describe('the failures', () => {
  async function failure(status: number, body: unknown): Promise<SubscriptionApiError> {
    reply(status, body)
    return startSubscription('a1', null).then(
      () => {
        throw new Error('should have failed')
      },
      (e: SubscriptionApiError) => e,
    )
  }

  it('a refused subscription carries why, and whose plan covers it', async () => {
    const e = await failure(409, { error: 'subscription_not_allowed', reason: 'covered_by_family', coveredBy: 'Ana' })
    expect(e).toBeInstanceOf(SubscriptionApiError)
    expect(e.kind).toBe('not_allowed')
    expect(e.reason).toBe('covered_by_family')
    expect(e.coveredBy).toBe('Ana')
  })

  it('tells apart a charge that is not configured, a provider that failed, a missing account and anything else', async () => {
    expect((await failure(503, {})).kind).toBe('unavailable')
    expect((await failure(502, { message: 'x' })).kind).toBe('provider_error')
    expect((await failure(404, {})).kind).toBe('not_found')
    expect((await failure(403, {})).kind).toBe('not_found')
    expect((await failure(500, {})).kind).toBe('unknown')
    expect((await failure(409, { error: 'other' })).kind).toBe('unknown')
  })
})
