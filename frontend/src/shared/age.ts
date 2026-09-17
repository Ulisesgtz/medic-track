export interface Age {
  value: number
  unit: 'meses' | 'años'
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

  let months = (nowYear - birthYear) * 12 + (nowMonth - birthMonth)
  if (nowDay < birthDay) {
    months -= 1
  }
  if (months < 0) {
    months = 0
  }

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
