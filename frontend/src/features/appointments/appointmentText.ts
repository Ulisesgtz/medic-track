// How an appointment and its notices are said in words (specs/033, part 2; mocks CitaTarjeta / CitaCampos / CitasHistorial).
// Pure: only what the parent wrote, repeated back with arithmetic of the dates — never a suggestion, never an alarm (Principio I).

import type { NoticeInput } from './types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] // Date.getDay() order
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const pad = (n: number) => String(n).padStart(2, '0')

export const timeText = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
/** "9 oct". */
export const dayMonthText = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`
/** "vie 9 oct". */
export const shortDayText = (d: Date) => `${WEEKDAYS[d.getDay()]} ${dayMonthText(d)}`
/** "Vie 9 oct": the big date of the card. */
export const bigDateText = (d: Date) => `${WEEKDAYS[d.getDay()].charAt(0).toUpperCase()}${WEEKDAYS[d.getDay()].slice(1)} ${dayMonthText(d)}`
/** "jue 8 oct, 10:30". */
export const whenText = (d: Date) => `${shortDayText(d)}, ${timeText(d)}`
/** "viernes 9 oct". */
export const longDayText = (d: Date) => `${WEEKDAYS_LONG[d.getDay()]} ${dayMonthText(d)}`

const dayNumber = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)

/** The device's local date and time as one instant, or null while either is missing or invalid. */
export function startsAtOf(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const d = new Date(`${date}T${time}:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export const MAX_NOTICES = 5

/** The two notices a new appointment gets: one day before and two hours before. */
export const defaultNotices = (): NoticeInput[] => [
  { kind: 'before', leadMinutes: 1440, daysBefore: null, atTime: null },
  { kind: 'before', leadMinutes: 120, daysBefore: null, atTime: null },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** «1 día antes», «2 horas antes», «30 minutos antes», «El mismo día a las 07:00», «Un día antes a las 20:00». */
export function noticeLabel(n: NoticeInput): string {
  if (n.kind === 'before') {
    const m = n.leadMinutes ?? 0
    if (m % 1440 === 0) return `${plural(m / 1440, 'día', 'días')} antes`
    if (m % 60 === 0) return `${plural(m / 60, 'hora', 'horas')} antes`
    return `${plural(m, 'minuto', 'minutos')} antes`
  }
  const days = n.daysBefore ?? 0
  if (days === 0) return `El mismo día a las ${n.atTime}`
  if (days === 1) return `Un día antes a las ${n.atTime}`
  return `${days} días antes a las ${n.atTime}`
}

/** The instant a notice would go off for an appointment starting at `start`, in the device's own zone. */
export function noticeFireAt(start: Date, n: NoticeInput): Date | null {
  if (n.kind === 'before') return n.leadMinutes ? new Date(start.getTime() - n.leadMinutes * 60_000) : null
  const match = /^(\d{2}):(\d{2})$/.exec(n.atTime ?? '')
  if (!match || n.daysBefore === null) return null
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() - n.daysBefore, Number(match[1]), Number(match[2]))
}

export const sameNotice = (a: NoticeInput, b: NoticeInput) =>
  a.kind === b.kind && a.leadMinutes === b.leadMinutes && a.daysBefore === b.daysBefore && a.atTime === b.atTime

/** «era hoy, 10:30», «era ayer, 10:30», «era el jue 8 oct, 10:30»: when a notice that already passed was due. */
export function pastWhen(fire: Date, now: Date): string {
  const diff = dayNumber(now) - dayNumber(fire)
  const day = diff === 0 ? 'hoy' : diff === 1 ? 'ayer' : `el ${shortDayText(fire)}`
  return `era ${day}, ${timeText(fire)}`
}

/** The sentence under the notices when some already passed: they won't be sent, the rest stay. */
export function pastNoticesNote(items: { label: string; fire: Date }[], now: Date): string | null {
  if (items.length === 0) return null
  if (items.length === 1) {
    const { label, fire } = items[0]
    const diff = dayNumber(now) - dayNumber(fire)
    const day = diff === 0 ? 'hoy' : diff === 1 ? 'ayer' : `el ${shortDayText(fire)}`
    return `El aviso de «${label}» habría llegado ${day} a las ${timeText(fire)}, que ya pasó, así que no se enviará. Los demás siguen igual.`
  }
  return `Estos avisos ya pasaron, así que no se enviarán: ${items.map((i) => `«${i.label}»`).join(', ')}. Los demás siguen igual.`
}

/** The neutral count-down chip of the card: «en 3 días», «mañana», «hoy, en 2 horas», «hoy». Never a warning. */
export function countdown(start: Date, now: Date): string {
  const days = dayNumber(start) - dayNumber(now)
  if (days >= 2) return `en ${days} días`
  if (days === 1) return 'mañana'
  if (days < 0) return 'ya pasó'
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000)
  if (minutes >= 120) return `hoy, en ${Math.floor(minutes / 60)} horas`
  if (minutes >= 60) return 'hoy, en 1 hora'
  if (minutes > 0) return `hoy, en ${minutes} minutos`
  return 'hoy'
}

export type NoticeUnit = 'minutos' | 'horas' | 'dias'

/** Minutes of «N unidad antes», or null when it is not a whole number from 1 up to 30 days. */
export function leadMinutesOf(amount: string, unit: NoticeUnit): number | null {
  if (!/^\d{1,5}$/.test(amount.trim())) return null
  const n = Number(amount)
  const minutes = n * (unit === 'dias' ? 1440 : unit === 'horas' ? 60 : 1)
  return n >= 1 && minutes <= 43_200 ? minutes : null
}

/** The examples of notices (format only: they fill the field, they are not advice). */
export const NOTICE_EXAMPLES: { label: string; notice: NoticeInput }[] = [
  { label: 'El mismo día, 3 horas antes', notice: { kind: 'before', leadMinutes: 180, daysBefore: null, atTime: null } },
  { label: '30 minutos antes', notice: { kind: 'before', leadMinutes: 30, daysBefore: null, atTime: null } },
  { label: 'Un día antes a las 20:00', notice: { kind: 'at_time', leadMinutes: null, daysBefore: 1, atTime: '20:00' } },
]
