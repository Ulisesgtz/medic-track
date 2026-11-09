// specs/063: the child's age at a measurement, read from plain YYYY-MM-DD dates (no time zone can shift a day).

const DAYS_PER_MONTH = 30.4375

function utcDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole calendar months between two dates (the day of the month decides, as a birthday). */
function wholeMonths(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = on.split('-').map(Number)
  let months = (y - by) * 12 + (m - bm)
  if (d < bd) months -= 1
  return Math.max(months, 0)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** «6 semanas» under three months, «7 meses» under a year, then «1 año 1 mes» / «4 años» (the mock of spec 065). */
export function ageAt(birth: string, on: string): string {
  const days = Math.max(0, Math.round((utcDay(on) - utcDay(birth)) / 86_400_000))
  const months = wholeMonths(birth, on)
  if (months < 3) return days < 7 ? plural(days, 'día', 'días') : plural(Math.floor(days / 7), 'semana', 'semanas')
  if (months < 12) return plural(months, 'mes', 'meses')
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? plural(years, 'año', 'años') : `${plural(years, 'año', 'años')} ${plural(rest, 'mes', 'meses')}`
}

/** The age in months the chart uses (days / 30.4375, the WHO's convention). */
export function monthsAt(birth: string, on: string): number {
  return (utcDay(on) - utcDay(birth)) / 86_400_000 / DAYS_PER_MONTH
}
