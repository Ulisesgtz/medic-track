export interface Age {
  value: number
  unit: 'meses' | 'años'
}

/** Whole calendar months between a YYYY-MM-DD birth date and `now` (never negative). */
function elapsedMonths(birthDate: string, now: Date): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number)
  let months = (now.getFullYear() - birthYear) * 12 + (now.getMonth() + 1 - birthMonth)
  if (now.getDate() < birthDay) {
    months -= 1
  }
  return Math.max(months, 0)
}

/**
 * Computes a child's display age from their birth date: months while under
 * 2 years old, whole years from then on (spec.md Aclaraciones — avoids the
 * meaningless "0 años" case for babies).
 */
export function computeAge(birthDate: string, now: Date = new Date()): Age {
  // birthDate is a plain YYYY-MM-DD string with no timezone of its own —
  // read its calendar fields directly from the string instead of going
  // through `Date` (which would parse it as UTC midnight). `now` is a real
  // wall-clock instant, so it must be read with the LOCAL accessors to match
  // what the user actually sees as "today" — mixing UTC-for-birth with
  // local-for-now (or vice versa) shifts the age by up to a day for anyone
  // outside UTC, which is every user of this app (Mexico, UTC-6/UTC-5).
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number)
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  const nowDay = now.getDate()

  const months = elapsedMonths(birthDate, now)

  if (months < 24) {
    return { value: months, unit: 'meses' }
  }

  let years = nowYear - birthYear
  const hasHadBirthdayThisYear =
    nowMonth > birthMonth || (nowMonth === birthMonth && nowDay >= birthDay)
  if (!hasHadBirthdayThisYear) {
    years -= 1
  }

  return { value: years, unit: 'años' }
}

/**
 * Age for the child's detail header: years and months ("5 años 6 meses"),
 * or just months while under 2 years old ("14 meses").
 */
export function formatAgeLong(birthDate: string, now: Date = new Date()): string {
  const months = elapsedMonths(birthDate, now)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  if (months < 24) return plural(months, 'mes', 'meses')
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? plural(years, 'año', 'años') : `${plural(years, 'año', 'años')} ${plural(rest, 'mes', 'meses')}`
}

/** Compact age for the sidebar: "5a 6m", "5a", or "14m" while under 2 years. */
export function formatAgeShort(birthDate: string, now: Date = new Date()): string {
  const months = elapsedMonths(birthDate, now)
  if (months < 24) return `${months}m`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? `${years}a` : `${years}a ${rest}m`
}
