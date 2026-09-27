import { base64UrlToUint8Array } from './deviceSupport'
import { removeDevice } from './api'

// The browser side of a reminder device: the service worker registration and its push subscription.

const READY_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** The active service worker registration (it registers itself when the app loads). */
export function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  return withTimeout(navigator.serviceWorker.ready, READY_TIMEOUT_MS)
}

/** This browser's current push subscription, if reminders are on here. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

/** Subscribes this browser with the server's VAPID public key. */
export async function subscribe(vapidPublicKey: string): Promise<PushSubscription> {
  const registration = await serviceWorkerReady()
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
  })
}

/**
 * Turns reminders off here: drops the browser's subscription and tells the backend. If telling the
 * backend fails, the subscription is already gone, so the next push gets a 404/410 and the backend
 * turns the device off itself (research.md R10).
 */
export async function unsubscribeThisDevice(accountId: string, token: string | null): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  const { endpoint } = subscription
  await subscription.unsubscribe()
  await removeDevice(accountId, endpoint, token)
}

/**
 * For logout: best effort and never longer than `ms` — signing out must not wait on the network.
 */
export async function unsubscribeOnLogout(accountId: string, token: string | null, ms = 3_000): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await withTimeout(unsubscribeThisDevice(accountId, token), ms)
  } catch {
    // The 404/410 of the next push turns the device off anyway.
  }
}
