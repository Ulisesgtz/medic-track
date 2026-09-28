import { describe, it, expect, vi, afterEach } from 'vitest'
import { currentSubscription, serviceWorkerReady, subscribe, unsubscribeOnLogout, unsubscribeThisDevice } from './pushDevice'
import { callsTo, clearPushEnv, ENDPOINT, stubApi, stubPushEnv } from './pushEnv.test-utils'

describe('pushDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    clearPushEnv()
  })

  it('currentSubscription: the subscription, or null with no registration or none', async () => {
    stubPushEnv({ subscribed: true })
    expect((await currentSubscription())?.endpoint).toBe(ENDPOINT)

    stubPushEnv({ subscribed: false })
    expect(await currentSubscription()).toBeNull()

    stubPushEnv({ registration: false })
    expect(await currentSubscription()).toBeNull()
  })

  it('subscribe: user-visible, with the VAPID key as bytes', async () => {
    const env = stubPushEnv()
    await subscribe('AQID')
    const options = env.pushManager.subscribe.mock.calls[0][0]
    expect(options.userVisibleOnly).toBe(true)
    expect(Array.from(options.applicationServerKey)).toEqual([1, 2, 3])
  })

  it('serviceWorkerReady gives up if the service worker never becomes ready', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: new Promise(() => {}) } })
    const ready = serviceWorkerReady().catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await ready).toBe('timeout')
  })

  it('serviceWorkerReady passes on a registration failure', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.reject(new Error('broken')) } })
    await expect(serviceWorkerReady()).rejects.toThrow('broken')
  })

  it('unsubscribeThisDevice drops the subscription and tells the backend', async () => {
    const env = stubPushEnv({ subscribed: true })
    const fetchMock = stubApi({ 'POST /accounts/a1/reminder-devices/remove': { status: 204 } })

    await unsubscribeThisDevice('a1', 'tok')

    expect(env.subscription.unsubscribe).toHaveBeenCalled()
    expect(callsTo(fetchMock, 'POST', '/remove')).toHaveLength(1)
  })

  it('unsubscribeThisDevice does nothing when reminders are off here', async () => {
    stubPushEnv({ subscribed: false })
    const fetchMock = stubApi({})
    await unsubscribeThisDevice('a1', 'tok')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('unsubscribeOnLogout never throws and never waits more than its limit', async () => {
    stubPushEnv({ subscribed: true })
    stubApi({}) // the backend answers 500
    await expect(unsubscribeOnLogout('a1', 'tok')).resolves.toBeUndefined()

    vi.useFakeTimers()
    stubPushEnv({ subscribed: true })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {}))) // never answers
    const done = unsubscribeOnLogout('a1', 'tok', 3_000)
    await vi.advanceTimersByTimeAsync(3_000)
    await expect(done).resolves.toBeUndefined()
  })

  it('unsubscribeOnLogout returns at once in a browser without service workers', async () => {
    await expect(unsubscribeOnLogout('a1', 'tok')).resolves.toBeUndefined()
  })
})
