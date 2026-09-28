/// <reference lib="webworker" />
// The service worker: receives the dose reminders and handles taps on them (specs/011). Only wiring —
// what each reminder says and does lives in features/reminders/notification.ts, where it's tested.
import {
  buildNotification,
  focusOrOpen,
  markTaken,
  MARK_FAILED,
  parsePayload,
  TAKEN_ACTION,
  targetUrl,
  type ReminderPayload,
} from './features/reminders/notification'

declare const self: ServiceWorkerGlobalScope

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const payload = parsePayload(() => event.data?.json())
  if (!payload) return
  const { title, options } = buildNotification(payload)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  const payload = event.notification.data as ReminderPayload | undefined
  event.notification.close()
  if (!payload) return

  if (event.action === TAKEN_ACTION && payload.actionToken) {
    event.waitUntil(
      markTaken(fetch, API_BASE_URL, payload.actionToken).then((ok) =>
        ok ? undefined : self.registration.showNotification(MARK_FAILED.title, MARK_FAILED.options),
      ),
    )
    return
  }
  event.waitUntil(focusOrOpen(self.clients, self.location.origin, targetUrl(payload)))
})
