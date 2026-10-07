// How a routine is said in words (specs/033, mocks RutinaTarjeta / RutinaDetalle / RutinaForm). Pure: only what the parent wrote,
// repeated back — arithmetic of the times they chose, never a suggestion (Principio I).

import { dayKey } from '../consultations/treatmentDays'
import type { Routine, RoutinePeriod } from './types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
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

/** The local day of an instant as "2 oct". */
export const instantDayMonth = (instant: string | Date) => dayMonth(dayKey(instant))

/**
 * The hours of every day when a routine repeats "cada N horas" from `firstTime`: only when N divides 24, because then each
 * day has the same hours ("06:00, 14:00 y 22:00"). Otherwise the hours slide from one day to the next and there is no fixed list.
 */
export function intervalDayTimes(firstTime: string, everyHours: number): string[] | null {
  const [h, m] = firstTime.split(':').map(Number)
  if (!Number.isInteger(everyHours) || everyHours < 1 || everyHours > 24 || Number.isNaN(h) || Number.isNaN(m)) return null
  if (24 % everyHours !== 0) return null
  const start = h * 60 + m
  const step = everyHours * 60
  const out: number[] = []
  for (let minute = start % step; minute < 24 * 60; minute += step) out.push(minute)
  const pad = (n: number) => String(n).padStart(2, '0')
  return out.map((minute) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`)
}

/** The form's preview for "cada N horas" (R3): the arithmetic of what the parent typed. Null while it can't be computed. */
export function intervalPreview(firstTime: string, everyHours: number): string | null {
  if (!Number.isInteger(everyHours) || everyHours < 1 || everyHours > 24 || !/^\d{2}:\d{2}$/.test(firstTime)) return null
  const times = intervalDayTimes(firstTime, everyHours)
  if (times) return `Con esto, cada día las tomas quedan a las ${joinTimes(times)}.`
  return `Con esto, las tomas siguen cada ${everyHours} horas desde la primera y la hora cambia de un día al otro.`
}

const everyText = (n: number) => (n === 1 ? 'Cada hora' : `Cada ${n} horas`)

/** "Todos los días · 08:00", "Lun, Mié, Vie · 09:00", "Cada 8 horas · 06:00, 14:00 y 22:00". */
export function periodText(r: Pick<Routine, 'period' | 'times' | 'weekdays' | 'intervalHours' | 'firstTime'>): string {
  if (r.period === 'interval') {
    const n = r.intervalHours ?? 0
    const times = r.firstTime ? intervalDayTimes(r.firstTime, n) : null
    return times ? `${everyText(n)} · ${joinTimes(times)}` : `${everyText(n)} · desde las ${r.firstTime ?? ''}`
  }
  const times = joinTimes(r.times)
  if (r.period === 'weekdays') {
    const days = [...r.weekdays].sort((a, b) => a - b).map((d) => WEEKDAYS_SHORT[d])
    return `${days.join(', ')} · ${times}`
  }
  return `Todos los días · ${times}`
}

/** "Desde el 1 oct · sin fecha de fin" or "Del 2 al 20 oct" (the second month only when it differs). */
export function rangeText(r: Pick<Routine, 'firstDate' | 'endDate'>): string {
  if (!r.endDate) return `Desde el ${dayMonth(r.firstDate)} · sin fecha de fin`
  const a = parseDay(r.firstDate)
  const b = parseDay(r.endDate)
  if (a.y === b.y && a.m === b.m) return `Del ${a.d} al ${dayMonth(r.endDate)}`
  return `Del ${dayMonth(r.firstDate)} al ${dayMonth(r.endDate)}`
}

const dayNumber = (iso: string) => {
  const { y, m, d } = parseDay(iso)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

export interface ProgressSummary {
  /** The big line: "Día 5 de 19", "24 tomas" or "12 de 14". */
  big: string
  sub: string
  /** Percent of the days elapsed; only for a routine with an end date. */
  pct: number | null
}

/** The progress of a routine (the card's line and the detail's panel). Counts only what the server counted. */
export function progressSummary(r: Routine, today: string): ProgressSummary {
  const { taken, elapsed, total } = r.progress
  if (r.status === 'ended') return { big: `${taken} de ${total}`, sub: 'tomas marcadas', pct: null }
  if (r.endDate) {
    const days = dayNumber(r.endDate) - dayNumber(r.firstDate) + 1
    const n = Math.min(Math.max(dayNumber(today) - dayNumber(r.firstDate) + 1, 1), days)
    return {
      big: `Día ${n} de ${days}`,
      sub: `${taken} de ${elapsed} tomas marcadas hasta ahora · termina el ${dayMonth(r.endDate)}`,
      pct: Math.round((n / days) * 100),
    }
  }
  return { big: `${taken} ${taken === 1 ? 'toma' : 'tomas'}`, sub: `marcadas de ${elapsed} hasta ahora`, pct: null }
}

/** The card's one line of progress: "Día 5 de 19" with an end date, "24 tomas marcadas de 26" without; none before any dose came. */
export function cardProgress(r: Routine, today: string): { text: string; pct: number | null } | null {
  if (r.status === 'ended' || r.progress.elapsed === 0) return null
  const s = progressSummary(r, today)
  if (s.pct !== null) return { text: s.big, pct: s.pct }
  return { text: `${r.progress.taken} ${r.progress.taken === 1 ? 'toma marcada' : 'tomas marcadas'} de ${r.progress.elapsed}`, pct: null }
}

/** "Hoy no le toca. La siguiente es mañana, mié 7 oct, a las 09:00." */
export function noTodayText(nextAt: string, today: string): string {
  const next = new Date(nextAt)
  const key = dayKey(next)
  const hh = String(next.getHours()).padStart(2, '0')
  const mm = String(next.getMinutes()).padStart(2, '0')
  const label = `${WEEKDAYS_LOWER[next.getDay()]} ${dayMonth(key)}, a las ${hh}:${mm}`
  return dayNumber(key) - dayNumber(today) === 1 ? `Hoy no le toca. La siguiente es mañana, ${label}.` : `Hoy no le toca. La siguiente es el ${label}.`
}

export const pausedCardText = (pausedAt: string) =>
  `Pausada desde el ${instantDayMonth(pausedAt)}. Mientras esté pausada no genera tomas ni avisos.`

export const pausedNote = (pausedAt: string) =>
  `Pausada desde el ${instantDayMonth(pausedAt)}. Mientras esté pausada no se crean tomas ni avisos. Lo marcado se conserva.`

export const endedCardText = (endedAt: string, taken: number, total: number) =>
  `Terminada el ${instantDayMonth(endedAt)} · ${taken} de ${total} tomas`

export const endedNote = (endedAt: string, taken: number, total: number) =>
  `Terminada el ${instantDayMonth(endedAt)} · ${taken} de ${total} tomas. Para volver a registrarla, crea una rutina nueva.`

/** The rows of the detail's data card. */
export function detailRows(r: Routine): { k: string; v: string }[] {
  const first = `${dayMonthYear(r.firstDate)}${r.period === 'interval' && r.firstTime ? `, ${r.firstTime}` : ''}`
  let dates: string
  if (r.status === 'ended') {
    const a = parseDay(r.firstDate)
    const b = r.endDate ? parseDay(r.endDate) : null
    dates = b && a.y === b.y && a.m === b.m ? `Del ${a.d} al ${dayMonthYear(r.endDate as string)}` : `Del ${dayMonth(r.firstDate)} al ${dayMonthYear(r.endDate ?? dayKey(r.endedAt ?? r.createdAt))}`
  } else if (r.endDate) {
    dates = `Primera toma el ${first} · última el ${dayMonthYear(r.endDate)}`
  } else {
    dates = `Primera toma el ${first} · sin fecha de fin`
  }
  const rows = [
    { k: 'Cada cuánto', v: periodText(r) },
    { k: 'Fechas', v: dates },
  ]
  if (r.note.trim() !== '') rows.push({ k: 'Nota', v: r.note })
  rows.push({ k: 'Creada por', v: `${r.createdBy}, el ${instantDayMonth(r.createdAt)}` })
  return rows
}

export const PERIOD_OPTIONS: { value: RoutinePeriod; label: string; desc: string }[] = [
  { value: 'daily', label: 'Todos los días', desc: 'A una o varias horas fijas.' },
  { value: 'weekdays', label: 'Ciertos días de la semana', desc: 'Eliges los días y la hora.' },
  { value: 'interval', label: 'Cada cierto número de horas', desc: 'Desde la primera toma, cada tantas horas.' },
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
