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
  // birthDate is a plain YYYY-MM-DD string (no time-of-day), which Date
  // parses as UTC midnight — read every field via the UTC accessors so a
  // negative-offset local timezone doesn't roll it back a calendar day.
  const birth = new Date(birthDate)

  let months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - birth.getUTCMonth())
  if (now.getUTCDate() < birth.getUTCDate()) {
    months -= 1
  }
  if (months < 0) {
    months = 0
  }

  if (months < 24) {
    return { value: months, unit: 'meses' }
  }

  let years = now.getUTCFullYear() - birth.getUTCFullYear()
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate())
  if (!hasHadBirthdayThisYear) {
    years -= 1
  }

  return { value: years, unit: 'años' }
}
