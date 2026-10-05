import { vi } from 'vitest'

// jsdom has no service worker, PushManager or Notification: these stubs stand in for a browser
// that supports reminders, with a knob for each thing the tests need to vary.

export const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1'

export interface PushEnv {
  subscription: {
    endpoint: string
    toJSON: () => PushSubscriptionJSON
    unsubscribe: ReturnType<typeof vi.fn>
  }
  pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
  requestPermission: ReturnType<typeof vi.fn>
  notification: { permission: NotificationPermission; requestPermission: ReturnType<typeof vi.fn> }
}

export function stubPushEnv({
  permission = 'default',
  requestResult = 'granted',
  subscribed = false,
  registration = true,
}: {
  permission?: NotificationPermission
  requestResult?: NotificationPermission
  subscribed?: boolean
  registration?: boolean
} = {}): PushEnv {
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscribed ? subscription : null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  }
  const reg = { pushManager }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(reg),
      getRegistration: vi.fn().mockResolvedValue(registration ? reg : undefined),
    },
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  const notification = { permission, requestPermission: vi.fn().mockResolvedValue(requestResult) }
  notification.requestPermission.mockImplementation(async () => {
    notification.permission = requestResult
    return requestResult
  })
  vi.stubGlobal('Notification', notification)
  return { subscription, pushManager, requestPermission: notification.requestPermission, notification }
}

/** Removes what stubPushEnv added (vi.unstubAllGlobals() takes care of the globals). */
export function clearPushEnv() {
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker
}

/** A fetch stub that answers by path; unknown paths are a 500. */
export function stubApi(routes: Record<string, { status?: number; body?: unknown }>) {
  const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const key = Object.keys(routes).find((k) => {
      const [m, path] = k.split(' ')
      return m === method && url.includes(path)
    })
    const route = key ? routes[key] : { status: 500, body: { message: 'boom' } }
    const status = route.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => route.body ?? {} } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function callsTo(fetchMock: ReturnType<typeof vi.fn>, method: string, path: string) {
  return fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && String(input).includes(path))
}
