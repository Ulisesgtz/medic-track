import { API_BASE_URL, isOffline, OfflineError } from '../offline/connectivity'
import { cleanMessage } from './clean'
import { appVersion, browserFamily, isInstalled, osFamily } from './environment'
import { routePattern } from './routePatterns'

// specs/072, research R7: what the phone tells the server about an error (POST /client-errors, contracts/client-errors.md).
// Fire and forget: never awaited by the caller, never retried, a failure is ignored and never produces another report. Equal errors
// are grouped and sent once, 3 s after the first, with how many times they happened; at most 5 reports per page load; without a
// connection nothing is sent and nothing is kept.

export type ClientErrorKind = 'error' | 'rejection' | 'render'

export const GROUP_WINDOW_MS = 3000
export const MAX_REPORTS_PER_LOAD = 5
const MAX_COUNT = 1000

interface Group {
  kind: ClientErrorKind
  message: string
  route: string
  count: number
}

const pending = new Map<string, Group>()
let budgetUsed = 0

/** Only for the tests: forget everything this page load has reported. */
export function resetClientErrorReports() {
  pending.clear()
  budgetUsed = 0
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === 'string') return error
  return ''
}

function isIgnored(error: unknown, message: string): boolean {
  if (error instanceof OfflineError) return true
  if (error instanceof Error && error.name === 'AbortError') return true
  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  )
    return true
  if (message === 'Script error.' || message === 'Script error') return true
  return /^ResizeObserver loop/.test(message)
}

function send(group: Group) {
  // Off at the moment of sending too: nothing is kept for later.
  if (isOffline()) return
  const body = JSON.stringify({
    kind: group.kind,
    message: group.message,
    route: group.route,
    version: appVersion(),
    browser: browserFamily(),
    os: osFamily(),
    installed: isInstalled(),
    count: Math.min(group.count, MAX_COUNT),
  })
  try {
    fetch(`${API_BASE_URL}/client-errors`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => undefined)
  } catch {
    // Nothing a failed report could do is worth more than the screen that is already failing.
  }
}

/** Tells the server an error happened (cleaned, grouped, limited). Never throws and never waits. */
export function reportClientError(kind: ClientErrorKind, error: unknown): void {
  try {
    if (isOffline()) return
    const raw = messageOf(error)
    if (isIgnored(error, raw)) return
    const message = cleanMessage(raw) || 'Unknown error'
    const route = routePattern(window.location.pathname)
    const key = `${kind}|${route}|${message}`

    const existing = pending.get(key)
    if (existing) {
      existing.count += 1
      return
    }
    if (budgetUsed >= MAX_REPORTS_PER_LOAD) return
    budgetUsed += 1
    pending.set(key, { kind, message, route, count: 1 })
    setTimeout(() => {
      const group = pending.get(key)
      pending.delete(key)
      if (group) send(group)
    }, GROUP_WINDOW_MS)
  } catch {
    // Reporting must never break the app.
  }
}
