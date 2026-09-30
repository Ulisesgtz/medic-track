// specs/019: what the treatment calendar shows, derived from the doses the consultation detail already brings and read
// in the parent's local time (the same clock as the dose chips). Nothing is stored and nothing changes a dose, a range
// or a status: it only presents them (FR-008). Days are `YYYY-MM-DD` strings, which sort as dates.

import { LONG_MONTHS } from '../../shared/date'
import type { Dose, Medication } from './types'

/** Local day of an instant as `YYYY-MM-DD`. */
export const dayKey = (instant: string | Date) => {
  const d = new Date(instant)
  return dayKeyOf(d.getFullYear(), d.getMonth(), d.getDate())
}

/** `month` is 0-based; out-of-range days and months roll over like `Date` does. */
export function dayKeyOf(year: number, month: number, day: number) {
  const d = new Date(year, month, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface Range {
  start: string
  end: string
}

/**
 * From the day of a medication's first dose to the day of its last one — every day in between, also those with no
 * dose (every 48 h or more). An ended treatment (spec 016) stops the day it ended; one ended before its first dose
 * has no range at all.
 */
export function medicationRange(medication: Medication): Range | null {
  const days = medication.doses.map((d) => dayKey(d.scheduledAt)).sort()
  if (days.length === 0) return null
  const start = days[0]
  const last = days[days.length - 1]
  const end = medication.endedAt ? minDay(last, dayKey(medication.endedAt)) : last
  return end < start ? null : { start, end }
}

const minDay = (a: string, b: string) => (a < b ? a : b)

export const MED_COLOR_COUNT = 6

/** Tailwind needs whole class names in the source: one per `--color-med-N` token (src/index.css). */
export const MED_BG = ['bg-med-1', 'bg-med-2', 'bg-med-3', 'bg-med-4', 'bg-med-5', 'bg-med-6'] as const

export const MED_TEXT = ['text-med-1', 'text-med-2', 'text-med-3', 'text-med-4', 'text-med-5', 'text-med-6'] as const

/** The background class of the N-th medication of the consultation (1-based); from the 7th on the colors repeat. */
export const medBg = (number: number) => MED_BG[(number - 1) % MED_COLOR_COUNT]

/** Its text color (the number in a day cell): every token is at least 4.5:1 on the surface. */
export const medText = (number: number) => MED_TEXT[(number - 1) % MED_COLOR_COUNT]

export interface NumberedMedication {
  /** 1-based, by its place in the consultation: the second indicator next to the color. */
  number: number
  medication: Medication
  range: Range | null
}

export const numbered = (medications: Medication[]): NumberedMedication[] =>
  medications.map((medication, i) => ({ number: i + 1, medication, range: medicationRange(medication) }))

/** The numbers of the medications whose range contains the day, in order. */
export const marksOn = (day: string, meds: NumberedMedication[]): number[] =>
  meds.filter((m) => m.range && m.range.start <= day && day <= m.range.end).map((m) => m.number)

/** First and last day of the whole treatment (every medication), or null when none has a range. */
export function treatmentSpan(meds: NumberedMedication[]): Range | null {
  const ranges = meds.flatMap((m) => (m.range ? [m.range] : []))
  if (ranges.length === 0) return null
  return {
    start: ranges.map((r) => r.start).sort()[0],
    end: ranges.map((r) => r.end).sort().reverse()[0],
  }
}

export interface Month {
  year: number
  /** 0-based. */
  month: number
}

/** Every month from the one of the first day to the one of the last: the calendar never goes to an empty month. */
export function monthsOf(span: Range): Month[] {
  const [sy, sm] = span.start.split('-').map(Number)
  const [ey, em] = span.end.split('-').map(Number)
  const months: Month[] = []
  for (let y = sy, m = sm - 1; y < ey || (y === ey && m <= em - 1); m++) {
    if (m > 11) {
      m = 0
      y++
    }
    months.push({ year: y, month: m })
  }
  return months
}

export interface GridDay {
  key: string
  day: number
  /** False for the days of the neighbouring months that complete the first and last week. */
  inMonth: boolean
}

/** The weeks of a month, Monday first, as rows of 7 days. */
export function monthGrid({ year, month }: Month): GridDay[][] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks = Math.ceil((lead + daysInMonth) / 7)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(year, month, 1 - lead + w * 7 + d)
      return { key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month }
    }),
  )
}

/** Today when it falls inside the treatment; otherwise its first day. Null when there is no treatment to show. */
export function initialDay(meds: NumberedMedication[], today: string): string | null {
  const span = treatmentSpan(meds)
  if (!span) return null
  return span.start <= today && today <= span.end ? today : span.start
}

export interface DayDose {
  number: number
  medication: Medication
  dose: Dose
}

/** The doses of every medication on the day, by time of day. */
export function dosesOn(day: string, medications: Medication[]): DayDose[] {
  return medications
    .flatMap((medication, i) =>
      medication.doses.filter((dose) => dayKey(dose.scheduledAt) === day).map((dose) => ({ number: i + 1, medication, dose })),
    )
    .sort((a, b) => a.dose.scheduledAt.localeCompare(b.dose.scheduledAt) || a.number - b.number)
}

/** "30 de septiembre" of a `YYYY-MM-DD` day. */
export const longDay = (day: string) => {
  const [, month, date] = day.split('-').map(Number)
  return `${date} de ${LONG_MONTHS[month - 1]}`
}

/** The month the day belongs to. */
export const monthOfDay = (day: string): Month => {
  const [year, month] = day.split('-').map(Number)
  return { year, month: month - 1 }
}
