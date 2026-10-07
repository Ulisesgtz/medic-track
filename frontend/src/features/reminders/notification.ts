import { formatTime } from '../../shared/date'
import { longDayText } from '../appointments/appointmentText'

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
  source?: 'supplement' | 'appointment'
  /** An appointment's reminder (specs/033, part 2): when it starts is `scheduledAt`; this is how long before it this one goes off. */
  appointmentId?: string
  leadMinutes?: number
  doctor?: string
  note?: string
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
  if ((p.kind !== 'detailed' && p.kind !== 'generic') || (!p.doseId && !p.appointmentId) || (!p.consultationId && !p.routineId && !p.appointmentId) || !p.scheduledAt) return null
  return p as ReminderPayload
}

/** «hoy»,«mañana» or «el viernes 9 oct»: the day of an appointment as the device sees it. */
function dayWord(start: Date, now: Date): string {
  const days = Math.round((Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `el ${longDayText(start)}`
}

/** «2 horas», «30 minutos», «1 día»: how long before the appointment a notice goes off. */
function leadText(minutes: number): string {
  const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  if (minutes % 1440 === 0) return unit(minutes / 1440, 'día', 'días')
  if (minutes % 60 === 0) return unit(minutes / 60, 'hora', 'horas')
  // A fixed-hour notice of the same day can be any number of minutes before: «3 h 10 min», not «190 minutos».
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
  return unit(minutes, 'minuto', 'minutos')
}

/**
 * The reminder of a next appointment (specs/033, part 2, mock section C): neutral, never an imperative («No olvides», «Lleva…»).
 * Generic: only that there is one and when — no child, doctor, exact time or note. With detail: the child, the doctor, the hour
 * and the note. «hoy, en 2 horas» when the same day, the day when it is further away.
 */
function buildAppointmentNotification(p: ReminderPayload, now: Date): ReminderNotification {
  const start = new Date(p.scheduledAt)
  const day = dayWord(start, now)
  const sameDay = day === 'hoy'
  const lead = p.leadMinutes ?? 0
  const when = sameDay && lead > 0 ? `hoy, en ${leadText(lead)}` : day
  const tag = `appointment-${p.appointmentId}-${p.leadMinutes ?? 0}`
  const data = p
  if (p.kind === 'detailed' && p.child) {
    const who = p.doctor ? `Con ${p.doctor}, ` : ''
    const note = p.note ? ` Nota: ${p.note}` : ''
    return {
      title: `Cita de ${p.child}: ${day} a las ${formatTime(p.scheduledAt)}`,
      options: { body: `${who}${sameDay && lead > 0 ? `en ${leadText(lead)}` : day}.${note}`, tag, icon: '/icon-192.png', badge: '/icon-192.png', data },
    }
  }
  return {
    title: 'Recordatorio de cita',
    options: { body: `Hay una cita registrada para ${when}.`, tag, icon: '/icon-192.png', badge: '/icon-192.png', data },
  }
}

/**
 * The notification shown for a reminder. It only repeats the schedule the tutor registered —
 * never an indication (Principio I). The time is in the device's own zone; `tag` makes a repeated
 * push replace the first one instead of stacking.
 */
export function buildNotification(p: ReminderPayload, now: Date = new Date()): ReminderNotification {
  if (p.source === 'appointment') return buildAppointmentNotification(p, now)
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
  return p.routineId ? `/suplementos/${p.routineId}` : `/consultations/${p.consultationId}` // an appointment's carries its consultation
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
