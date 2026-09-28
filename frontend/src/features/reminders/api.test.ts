import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchReminderConfig, registerDevice, removeDevice, RemindersApiError, updateReminderDetail } from './api'
import { callsTo, stubApi } from './pushEnv.test-utils'

const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'k', auth: 'a' } }

describe('reminders api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetchReminderConfig sends the session token', async () => {
    const fetchMock = stubApi({ 'GET /reminders/config': { body: { available: true, vapidPublicKey: 'pub' } } })
    expect(await fetchReminderConfig('tok')).toEqual({ available: true, vapidPublicKey: 'pub' })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('registerDevice posts the endpoint and keys only', async () => {
    const fetchMock = stubApi({ 'POST /accounts/a1/reminder-devices': { status: 201 } })
    await registerDevice('a1', { ...subscription, expirationTime: null }, 'tok')
    const [, init] = callsTo(fetchMock, 'POST', '/reminder-devices')[0]
    expect(JSON.parse(init.body)).toEqual(subscription)
  })

  it('removeDevice posts the endpoint', async () => {
    const fetchMock = stubApi({ 'POST /accounts/a1/reminder-devices/remove': { status: 204 } })
    await removeDevice('a1', subscription.endpoint, 'tok')
    expect(JSON.parse(callsTo(fetchMock, 'POST', '/remove')[0][1].body)).toEqual({ endpoint: subscription.endpoint })
  })

  it('updateReminderDetail patches and returns the account', async () => {
    stubApi({ 'PATCH /accounts/a1/reminder-settings': { body: { id: 'a1', reminderDetail: 'generic' } } })
    expect(await updateReminderDetail('a1', 'generic', 'tok')).toEqual({ id: 'a1', reminderDetail: 'generic' })
  })

  it.each([
    [400, 'validation_error'],
    [403, 'not_found'],
    [404, 'not_found'],
    [503, 'unavailable'],
    [500, 'unknown'],
  ])('maps %i to %s', async (status, kind) => {
    stubApi({ 'POST /accounts/a1/reminder-devices': { status, body: { message: 'm' } } })
    const err = await registerDevice('a1', subscription, 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(RemindersApiError)
    expect(err.kind).toBe(kind)
  })

  it('every call reports failures, even without a JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => Promise.reject(new SyntaxError('html')) }),
    )
    for (const call of [
      () => fetchReminderConfig('t'),
      () => removeDevice('a1', 'e', 't'),
      () => updateReminderDetail('a1', 'detailed', 't'),
    ]) {
      const err = await call().catch((e) => e)
      expect(err.kind).toBe('unknown')
    }
  })
})
