import { useSyncExternalStore } from 'react'
import { onlineManager } from '@tanstack/react-query'
import { ApiError } from '../apiError'

// Whether the app can talk to the server right now (specs/067, research R10). `navigator.onLine` only knows about the local network,
// so the real signal is the API itself: a request that fails for the network says «offline», any answer says «online». While the app
// shows the phone's copy without Clerk (R4) it is offline too. TanStack's `onlineManager` follows this, so queries pause without a
// connection and ask again on their own when it's back (FR-005).
//
// Nothing that changes data leaves without a connection (FR-007, R7): every request to the API that isn't a read is refused here,
// before the network, with an `OfflineError` — whatever screen or hook sends it, `useMutation` or not.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
export const PROBE_EVERY_MS = 10_000

export class OfflineError extends ApiError<'offline'> {
  constructor() {
    super('offline', 'This needs a connection')
  }
}

let networkFailed = false
let offlineSession = false
let snapshot = computeOffline()
const listeners = new Set<() => void>()

function browserOffline(): boolean {
  try {
    return navigator.onLine === false
  } catch {
    return false
  }
}

function computeOffline(): boolean {
  return offlineSession || networkFailed || browserOffline()
}

function commit() {
  const next = computeOffline()
  if (next === snapshot) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

export function isOffline(): boolean {
  return snapshot
}

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** `'offline'` while the app can't reach the server. */
export function useConnectivity(): 'online' | 'offline' {
  return useSyncExternalStore(subscribeConnectivity, () => (snapshot ? 'offline' : 'online'), () => 'online')
}

/** A request to the API failed for the network. */
export function reportNetworkFailure() {
  networkFailed = true
  commit()
}

/** The API answered (any status). */
export function reportReachable() {
  networkFailed = false
  commit()
}

/** The screens show the phone's copy without a confirmed session (research R4). */
export function setOfflineSession(on: boolean) {
  offlineSession = on
  commit()
}

export function isApiRequest(url: string): boolean {
  return url.startsWith(API_BASE_URL)
}

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/** `fetch` that refuses changes without a connection and tells this module what the network did. */
export function trackedFetch(original: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = urlOf(input)
    if (!isApiRequest(url)) return original(input, init)
    if (isOffline() && !READS.has(methodOf(input, init))) throw new OfflineError()
    try {
      const response = await original(input, init)
      reportReachable()
      return response
    } catch (error) {
      if (error instanceof TypeError) reportNetworkFailure()
      throw error
    }
  }
}

let installed = false
let probeTimer: ReturnType<typeof setInterval> | null = null

/**
 * Wire it all once, at start: the tracked `fetch`, the browser's online/offline events, a light read at once and then every 10 s
 * while the API didn't answer (one lost request doesn't leave the app «offline», and a signal that comes back is noticed without a
 * tap), and TanStack's `onlineManager`.
 */
export function installConnectivity() {
  if (installed) return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = trackedFetch(original)

  const probe = () => {
    void window.fetch(`${API_BASE_URL}/catalog/countries`, { cache: 'no-store' }).catch(() => undefined)
  }
  window.addEventListener('online', () => {
    commit()
    probe()
  })
  window.addEventListener('offline', commit)
  subscribeConnectivity(() => {
    if (snapshot && !browserOffline() && !offlineSession) {
      // A failure with the browser still online may be one lost request: ask at once, then every 10 s.
      if (!probeTimer) {
        probe()
        probeTimer = setInterval(probe, PROBE_EVERY_MS)
      }
    } else if (probeTimer) {
      clearInterval(probeTimer)
      probeTimer = null
    }
  })

  onlineManager.setEventListener((setOnline) => {
    setOnline(!snapshot)
    return subscribeConnectivity(() => setOnline(!snapshot))
  })
}

/** Tests only. */
export function resetConnectivity() {
  networkFailed = false
  offlineSession = false
  snapshot = computeOffline()
}
