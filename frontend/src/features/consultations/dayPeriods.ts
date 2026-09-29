// specs/015: the doses of a day of a medication grouped by moment of the day, in the parent's local time — the same
// clock the dose chips show. Presentation only: nothing is stored and no advice is attached (Principio I).

export type DayPeriod = 'morning' | 'afternoon' | 'night'

/**
 * The one place the ranges live: each moment starts at `from` (minutes since local midnight) and lasts until the next
 * one starts. The last one (Noche) wraps past midnight and runs until the first one (Mañana) starts again.
 */
export const PERIODS: { key: DayPeriod; label: string; from: number }[] = [
  { key: 'morning', label: 'Mañana', from: 5 * 60 },
  { key: 'afternoon', label: 'Tarde', from: 12 * 60 },
  { key: 'night', label: 'Noche', from: 19 * 60 },
]

const minutesOfDay = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Mañana 05:00–11:59, Tarde 12:00–18:59, Noche 19:00–04:59 (read from PERIODS). */
export function periodOf(iso: string): DayPeriod {
  const minutes = minutesOfDay(iso)
  // The latest moment that has already started; before the first one of the day starts it is still last night.
  const started = [...PERIODS].reverse().find((period) => minutes >= period.from)
  return (started ?? PERIODS[PERIODS.length - 1]).key
}

interface HasTime {
  scheduledAt: string
}

/**
 * Only the groups that have doses, in the order Mañana, Tarde, Noche; inside a group by time of day (the night
 * chronologically: 00:00–04:59 first, then 19:00 onwards).
 */
export function groupByPeriod<T extends HasTime>(doses: T[]): { key: DayPeriod; label: string; doses: T[] }[] {
  const sorted = [...doses].sort((a, b) => minutesOfDay(a.scheduledAt) - minutesOfDay(b.scheduledAt))
  return PERIODS.map(({ key, label }) => ({ key, label, doses: sorted.filter((d) => periodOf(d.scheduledAt) === key) })).filter(
    (group) => group.doses.length > 0,
  )
}
