import { formatTime } from '../../shared/date'

/**
 * What the backend pushes for a dose reminder (specs/011-recordatorios-push,
 * contracts/reminders-api.md). In generic mode there is no medication and no child.
 */
export interface ReminderPayload {
  kind: 'detailed' | 'generic'
  doseId: string
  /** A medication's dose has a consultation; a supplement routine's (specs/033, `source: "supplement"`) has a routine instead. */
  consultationId?: string
  routineId?: string
  source?: 'supplement'
  scheduledAt: string
  medication?: string
  child?: string
  actionToken?: string
}

export interface ReminderNotification {
  title: string
  options: NotificationOptions & { actions?: { action: string; title: string }[] }
}

/** The "Tomada" action of a reminder. */
export const TAKEN_ACTION = 'taken'

/** Reads a push's data; anything that isn't a reminder is ignored (null). */
export function parsePayload(read: () => unknown): ReminderPayload | null {
  let data: unknown
  try {
    data = read()
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const p = data as Partial<ReminderPayload>
  if ((p.kind !== 'detailed' && p.kind !== 'generic') || !p.doseId || (!p.consultationId && !p.routineId) || !p.scheduledAt) return null
  return p as ReminderPayload
}

/**
 * The notification shown for a reminder. It only repeats the schedule the tutor registered —
 * never an indication (Principio I). The time is in the device's own zone; `tag` makes a repeated
 * push replace the first one instead of stacking.
 */
export function buildNotification(p: ReminderPayload): ReminderNotification {
  const time = formatTime(p.scheduledAt)
  const body =
    p.kind === 'detailed' && p.medication
      ? [p.medication, time, p.child].filter(Boolean).join(' · ')
      : `Hay una toma programada · ${time}`
  return {
    title: 'Toma programada',
    options: {
      body,
      tag: `dose-${p.doseId}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: p,
      ...(p.actionToken ? { actions: [{ action: TAKEN_ACTION, title: 'Tomada' }] } : {}),
    },
  }
}

/** Where tapping a reminder goes: the consultation of that dose. */
export function targetUrl(p: ReminderPayload): string {
  return p.routineId ? `/suplementos/${p.routineId}` : `/consultations/${p.consultationId}`
}

interface WindowClientLike {
  url: string
  focus(): Promise<WindowClientLike | null | void>
  navigate?(url: string): Promise<unknown>
}

interface ClientsLike {
  matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly WindowClientLike[]>
  openWindow(url: string): Promise<unknown>
}

/**
 * Brings an open window of the app to the target, or opens a new one. Focus comes first — browsers
 * only allow it while the tap is fresh — and a window that can't be navigated (one this worker doesn't
 * control yet) falls back to a new window instead of doing nothing.
 */
export async function focusOrOpen(clients: ClientsLike, origin: string, path: string): Promise<void> {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  const mine = windows.find((w) => w.url.startsWith(origin))
  if (mine?.navigate) {
    try {
      const focused = (await mine.focus()) || mine
      await (focused.navigate ?? mine.navigate).call(focused, origin + path)
      return
    } catch {
      // Fall through to a new window.
    }
  }
  await clients.openWindow(origin + path)
}

/**
 * The "Tomada" action: sends the reminder's own token (there is no session in a service worker).
 * True when the dose was marked.
 */
export async function markTaken(fetchFn: typeof fetch, apiBaseUrl: string, token: string): Promise<boolean> {
  try {
    const res = await fetchFn(`${apiBaseUrl}/reminders/actions/taken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Shown when "Tomada" couldn't mark the dose (no connection, reminder too old). */
export const MARK_FAILED: ReminderNotification = {
  title: 'No se pudo marcar la toma',
  options: { body: 'Ábrela en la app para marcarla.', tag: 'dose-mark-failed', icon: '/icon-192.png' },
}
