// How a supplement or an activity is said in words (specs/033, specs/035, mocks SuplementoTarjeta / ActividadTarjeta /
// SuplementoDetalle / ActividadDetalle / ActividadForm). Pure: only what the parent wrote, repeated back — arithmetic of the
// hours they chose, never a suggestion (Principio I).

import { formatTime } from '../../shared/date'
import { dayKey } from '../consultations/treatmentDays'
import type { Routine, RoutineDose, RoutinePeriod } from './types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const WEEKDAYS_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const WEEKDAYS_LOWER = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] // Date.getDay() order

/** "08:00", "08:00 y 20:00", "06:00, 14:00 y 22:00". */
export function joinTimes(times: string[]): string {
  if (times.length <= 1) return times[0] ?? ''
  return `${times.slice(0, -1).join(', ')} y ${times[times.length - 1]}`
}

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** "6 oct" (no leading zero, as the mocks write it) from a "YYYY-MM-DD" date. */
export function dayMonth(iso: string): string {
  const { m, d } = parseDay(iso)
  return `${d} ${MONTHS[m - 1]}`
}

/** "6 oct 2026". */
export function dayMonthYear(iso: string): string {
  return `${dayMonth(iso)} ${parseDay(iso).y}`
}

/** "Hoy · jue 8 oct": the label of the detail's day card. */
export function todayLabel(date: Date): string {
  return `Hoy · ${WEEKDAYS_LOWER[date.getDay()]} ${dayMonth(dayKey(date))}`
}

/** The local day of an instant as "2 oct". */
export const instantDayMonth = (instant: string | Date) => dayMonth(dayKey(instant))

const everyDay = (weekdays: number[]) => weekdays.length === 0 || weekdays.length === 7

/** "Todos los días" or "Lun, Mié, Vie". */
export function daysText(weekdays: number[]): string {
  if (everyDay(weekdays)) return 'Todos los días'
  return [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAYS_SHORT[d]).join(', ')
}

/** "martes y jueves", "lunes, miércoles y viernes" (the form's preview). */
function namesText(weekdays: number[]): string {
  const names = [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAYS_FULL[d])
  return joinTimes(names)
}

const tomas = (n: number) => `${n} ${n === 1 ? 'toma' : 'tomas'}`

/** A supplement's line: "Todos los días · 6 tomas", "Lun, Mié, Vie · 2 tomas" (the hours are the chips'). */
export function supplementPeriodText(r: Pick<Routine, 'period' | 'times' | 'weekdays'>): string {
  const days = r.period === 'weekdays' ? daysText(r.weekdays) : 'Todos los días'
  return `${days} · ${tomas(r.times.length)}`
}

/** "Cada hora", "Cada 2 horas", "Cada 30 min": «cada N» as the parent chose it. */
export function everyText(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60
    return h === 1 ? 'Cada hora' : `Cada ${h} horas`
  }
  return `Cada ${minutes} min`
}

/** An activity's rule: "Cada hora, de 08:00 a 20:00" or, at fixed hours, "Mar, Jue · a las 17:00". */
export function activityRule(r: Pick<Routine, 'period' | 'times' | 'weekdays' | 'windowStart' | 'windowEnd' | 'intervalMinutes'>): string {
  if (r.period !== 'window') return `${daysText(r.weekdays)} · a las ${joinTimes(r.times)}`
  return `${everyText(r.intervalMinutes ?? 0)}, de ${r.windowStart ?? ''} a ${r.windowEnd ?? ''}`
}

/** "Del 2 al 20 oct" (the second month only when it differs). */
export function rangeText(r: Pick<Routine, 'firstDate' | 'endDate'>): string {
  if (!r.endDate) return `Desde el ${dayMonth(r.firstDate)} · sin fecha de fin`
  const a = parseDay(r.firstDate)
  const b = parseDay(r.endDate)
  if (a.y === b.y && a.m === b.m) return `Del ${a.d} al ${dayMonth(r.endDate)}`
  return `Del ${dayMonth(r.firstDate)} al ${dayMonth(r.endDate)}`
}

/** An activity's second line: "Todos los días · desde el 1 oct" / "Lun, Mié · del 2 al 20 oct" (at fixed hours the days are in the rule). */
export function activityRange(r: Pick<Routine, 'period' | 'weekdays' | 'firstDate' | 'endDate'>): string {
  if (r.period !== 'window') return rangeText(r)
  const range = r.endDate ? rangeText(r).replace(/^D/, 'd') : `desde el ${dayMonth(r.firstDate)}`
  return `${daysText(r.weekdays)} · ${range}`
}

/** How many times a day an activity goes off: from its start to its end every N minutes, the last one the last that fits. */
export function perDay(windowStart: string, windowEnd: string, everyMinutes: number): number {
  const [sh, sm] = windowStart.split(':').map(Number)
  const [eh, em] = windowEnd.split(':').map(Number)
  if ([sh, sm, eh, em].some(Number.isNaN) || !Number.isInteger(everyMinutes) || everyMinutes < 1) return 0
  const span = eh * 60 + em - (sh * 60 + sm)
  return span < 0 ? 0 : Math.floor(span / everyMinutes) + 1
}

/** The hour of the last dose of the day of an activity, "HH:MM". */
export function lastOfDay(windowStart: string, windowEnd: string, everyMinutes: number): string {
  const [sh, sm] = windowStart.split(':').map(Number)
  const n = perDay(windowStart, windowEnd, everyMinutes)
  const minute = sh * 60 + sm + (n - 1) * everyMinutes
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

/**
 * The activity form's preview (mock F5): the arithmetic of what the parent typed, without listing the hours. Null while it can't
 * be computed. «Con esto, cada martes y jueves hay 4 avisos: el primero a las 09:00 y el último a las 18:00.»
 */
export function activityPreview(windowStart: string, windowEnd: string, everyMinutes: number, weekdays: number[]): string | null {
  if (!/^\d{2}:\d{2}$/.test(windowStart) || !/^\d{2}:\d{2}$/.test(windowEnd)) return null
  const n = perDay(windowStart, windowEnd, everyMinutes)
  if (n === 0) return null
  const days = everyDay(weekdays) ? 'día' : namesText(weekdays)
  const count = n === 1 ? '1 aviso' : `${n} avisos`
  const last = lastOfDay(windowStart, windowEnd, everyMinutes)
  if (n === 1) return `Con esto, cada ${days} hay ${count}: a las ${windowStart}.`
  return `Con esto, cada ${days} hay ${count}: el primero a las ${windowStart} y el último a las ${last}.`
}

// ---------------------------------------------------------------------------------------------------------------------
// What the doses of the asked day say (the server sends only those of the window).

/** The day's count: how many doses it has and how many were marked. */
export function dayCount(doses: RoutineDose[]): { done: number; total: number } {
  return { done: doses.filter((d) => d.taken).length, total: doses.length }
}

/** The pct of the day's bar, 0–100. */
export function dayPct({ done, total }: { done: number; total: number }): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/** "15:00": the first unmarked dose of the day that has not come yet (the reminders that are still to go); null when none. */
export function nextUnmarked(doses: RoutineDose[], now: Date = new Date()): string | null {
  const next = [...doses]
    .filter((d) => !d.taken && new Date(d.scheduledAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
  return next ? formatTime(next.scheduledAt) : null
}

/** The last dose marked today: its marking time and who (only the name; never an e-mail). Null when none was marked. */
export function lastMarked(doses: RoutineDose[]): { at: string; by: string } | null {
  const marked = doses.filter((d) => d.taken && d.takenBy)
  if (marked.length === 0) return null
  const last = marked.reduce((a, b) => (new Date(a.takenBy!.at).getTime() >= new Date(b.takenBy!.at).getTime() ? a : b))
  return { at: formatTime(last.takenBy!.at), by: last.takenBy!.name }
}

/** The dose that «Quitar la última marca» takes back: the last one marked today. */
export function lastMarkedDose(doses: RoutineDose[]): RoutineDose | null {
  const marked = doses.filter((d) => d.taken && d.takenBy)
  if (marked.length === 0) return null
  return marked.reduce((a, b) => (new Date(a.takenBy!.at).getTime() >= new Date(b.takenBy!.at).getTime() ? a : b))
}

/** "Hoy no le toca. La siguiente es mañana, mié 7 oct, a las 09:00." (the person's own: "Hoy no toca…"). */
export function noTodayText(nextAt: string, today: string, own = false): string {
  const next = new Date(nextAt)
  const key = dayKey(next)
  const hh = String(next.getHours()).padStart(2, '0')
  const mm = String(next.getMinutes()).padStart(2, '0')
  const label = `${WEEKDAYS_LOWER[next.getDay()]} ${dayMonth(key)}, a las ${hh}:${mm}`
  const lead = own ? 'Hoy no toca.' : 'Hoy no le toca.'
  return dayNumber(key) - dayNumber(today) === 1 ? `${lead} La siguiente es mañana, ${label}.` : `${lead} La siguiente es el ${label}.`
}

const dayNumber = (iso: string) => {
  const { y, m, d } = parseDay(iso)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

// ---------------------------------------------------------------------------------------------------------------------
// Paused and ended.

type Gendered = Pick<Routine, 'kind'>

export const pausedCardText = (r: Gendered, pausedAt: string) =>
  r.kind === 'activity'
    ? `Pausada desde el ${instantDayMonth(pausedAt)}. Mientras esté pausada no llegan avisos. Lo marcado se conserva.`
    : `Pausado desde el ${instantDayMonth(pausedAt)}. Mientras esté pausado no genera tomas ni avisos.`

export const pausedNote = (r: Gendered, pausedAt: string) =>
  r.kind === 'activity'
    ? `Pausada desde el ${instantDayMonth(pausedAt)}. Mientras esté pausada no llegan avisos. Lo marcado se conserva.`
    : `Pausado desde el ${instantDayMonth(pausedAt)}. Mientras esté pausado no se crean tomas ni avisos. Lo marcado se conserva.`

export const endedCardText = (r: Gendered, endedAt: string, taken: number, total: number) =>
  r.kind === 'activity' ? `Terminada el ${instantDayMonth(endedAt)}` : `Terminado el ${instantDayMonth(endedAt)} · ${taken} de ${total} tomas`

export const endedNote = (r: Gendered, endedAt: string, taken: number, total: number) =>
  r.kind === 'activity'
    ? `Terminada el ${instantDayMonth(endedAt)}. Para volver a registrarla, agrega una actividad nueva.`
    : `Terminado el ${instantDayMonth(endedAt)} · ${taken} de ${total} tomas. Para volver a registrarlo, agrega un suplemento nuevo.`

// ---------------------------------------------------------------------------------------------------------------------
// The detail's data card.

function datesText(r: Routine): string {
  if (r.status === 'ended') {
    const a = parseDay(r.firstDate)
    const b = r.endDate ? parseDay(r.endDate) : null
    return b && a.y === b.y && a.m === b.m
      ? `Del ${a.d} al ${dayMonthYear(r.endDate as string)}`
      : `Del ${dayMonth(r.firstDate)} al ${dayMonthYear(r.endDate ?? dayKey(r.endedAt ?? r.createdAt))}`
  }
  const from = r.kind === 'activity' ? `Desde el ${dayMonthYear(r.firstDate)}` : `Primera toma el ${dayMonthYear(r.firstDate)}`
  const to = r.kind === 'activity' ? 'hasta el' : 'última el'
  return r.endDate ? `${from} · ${to} ${dayMonthYear(r.endDate)}` : `${from} · sin fecha de fin`
}

/** The rows of the detail's data card. `personal`: the person's own, so nobody «agregó» it. */
export function detailRows(r: Routine, personal = false): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = []
  if (r.kind === 'activity' && r.period === 'window') {
    rows.push({ k: 'Cada cuánto', v: activityRule(r) })
    rows.push({ k: 'Días', v: daysText(r.weekdays) })
    rows.push({ k: 'Avisos al día', v: String(perDay(r.windowStart ?? '', r.windowEnd ?? '', r.intervalMinutes ?? 0)) })
  } else if (r.kind === 'activity') {
    rows.push({ k: 'Días', v: daysText(r.weekdays) })
    rows.push({ k: 'Horas', v: joinTimes(r.times) })
  } else {
    if (r.period === 'weekdays') rows.push({ k: 'Días', v: daysText(r.weekdays) })
    rows.push({ k: 'Horas', v: joinTimes(r.times) })
  }
  rows.push({ k: 'Fechas', v: datesText(r) })
  if (r.note.trim() !== '') rows.push({ k: 'Nota', v: r.note })
  if (!personal) rows.push({ k: r.kind === 'activity' ? 'Agregada por' : 'Agregado por', v: `${r.createdBy}, el ${instantDayMonth(r.createdAt)}` })
  return rows
}

export const PERIOD_OPTIONS: { value: Exclude<RoutinePeriod, 'window'>; label: string; desc: string }[] = [
  { value: 'daily', label: 'Todos los días', desc: 'A una o varias horas fijas.' },
  { value: 'weekdays', label: 'Ciertos días de la semana', desc: 'Eliges los días y las horas.' },
]

/** Segments of the weekday bar (0 = Monday): the short label and the full name for the accessible one. */
export const WEEKDAY_SEGMENTS = [
  { l: 'Lu', full: 'lunes' },
  { l: 'Ma', full: 'martes' },
  { l: 'Mi', full: 'miércoles' },
  { l: 'Ju', full: 'jueves' },
  { l: 'Vi', full: 'viernes' },
  { l: 'Sá', full: 'sábado' },
  { l: 'Do', full: 'domingo' },
]
