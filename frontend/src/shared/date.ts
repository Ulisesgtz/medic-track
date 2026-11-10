const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Formats a plain YYYY-MM-DD date as "15 sep 2026" (day always two digits:
 * "05 ene 2026"). The month names are fixed
 * here (not `Intl`) so the output doesn't vary by ICU version, and the string
 * is read field by field so no timezone shifts the day. Anything that isn't
 * YYYY-MM-DD is returned untouched.
 */
export function formatDateShort(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return isoDate
  return `${match[3]} ${month} ${match[1]}`
}

/** «3 oct 2026»: like `formatDateShort` without the day's leading zero (the growth screen's mock, spec 065). */
export function formatDateShortNoPad(isoDate: string): string {
  const short = formatDateShort(isoDate)
  return short === isoDate ? short : short.replace(/^0/, '')
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local wall-clock time of an instant as "16:00". */
export function formatTime(instant: string | Date): string {
  const d = new Date(instant)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Local day and month of an instant as "19 sep". */
export function formatDayMonth(instant: string | Date): string {
  const d = new Date(instant)
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`
}

/** The parent's local "today" as [start, next start) — what the overview endpoint takes. */
export function localDayRange(now: Date = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  }
}

export const LONG_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** A local day as "jueves 1 de noviembre" (the home's greeting, specs/055). */
export function formatWeekdayLong(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} de ${LONG_MONTHS[date.getMonth()]}`
}

/** A plain YYYY-MM-DD date as "12 septiembre 2026" (consultation detail header). */
export function formatDateLong(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate
  const month = LONG_MONTHS[Number(match[2]) - 1]
  if (!month) return isoDate
  return `${Number(match[3])} ${month} ${match[1]}`
}
