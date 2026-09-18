const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Formats a plain YYYY-MM-DD date as "15 sep 2026". The month names are fixed
 * here (not `Intl`) so the output doesn't vary by ICU version, and the string
 * is read field by field so no timezone shifts the day. Anything that isn't
 * YYYY-MM-DD is returned untouched.
 */
export function formatDateShort(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return isoDate
  return `${Number(match[3])} ${month} ${match[1]}`
}
