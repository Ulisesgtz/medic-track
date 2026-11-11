/// <reference lib="webworker" />
// The service worker: receives the dose reminders and handles taps on them (specs/011), and keeps the app's own files so the
// installed app opens without a signal (specs/067). Only wiring — what each reminder says and does lives in
// features/reminders/notification.ts and what each request gets in shared/offline/swRoutes.ts, where they're tested.
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  fallbackDocument,
  FONTS_CACHE,
  FONTS_MAX_ENTRIES,
  isAppNavigation,
  isFontRequest,
  fetchWithin,
  NAVIGATION_TIMEOUT_SECONDS,
} from './shared/offline/swRoutes'
import {
  buildNotification,
  focusOrOpen,
  markTaken,
  MARK_FAILED,
  parsePayload,
  TAKEN_ACTION,
  targetUrl,
  UNKNOWN_REMINDER,
  type ReminderPayload,
} from './features/reminders/notification'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// A page: the network first (the published app, so «Actualizar» loads it); without a network — or after 3 s — the document saved with
// THIS service worker's files (never an older page whose files were already cleaned up).
registerRoute(
  ({ request, url }) => isAppNavigation(request, url, self.location.origin),
  async ({ url }) => {
    try {
      return await fetchWithin(url.href, NAVIGATION_TIMEOUT_SECONDS * 1000)
    } catch {
      const saved = await matchPrecache(fallbackDocument(url.pathname))
      return saved ?? Response.error()
    }
  },
)

// The app's own files of this build (hashed names, index.html, icons): the shell, no one's data. Registered AFTER the page route:
// Workbox's precache route would otherwise answer «/» and «/hijo/hoy» from the saved copy even with a network.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// The font (Google Fonts): part of the shell.
registerRoute(
  ({ url }) => isFontRequest(url),
  new StaleWhileRevalidate({ cacheName: FONTS_CACHE, plugins: [new ExpirationPlugin({ maxEntries: FONTS_MAX_ENTRIES })] }),
)

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const payload = parsePayload(() => event.data?.json())
  // Every push shows a notification, even one this version can't read: iOS revokes the subscription of an app that doesn't.
  if (!payload) {
    event.waitUntil(self.registration.showNotification(UNKNOWN_REMINDER.title, UNKNOWN_REMINDER.options))
    return
  }
  const { title, options } = buildNotification(payload)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  const payload = event.notification.data as ReminderPayload | undefined
  event.notification.close()
  if (!payload) {
    event.waitUntil(focusOrOpen(self.clients, self.location.origin, '/home'))
    return
  }

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
