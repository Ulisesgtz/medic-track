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
 * The days a medication has doses to take, sorted: those of every dose that was not canceled (specs/016 — a treatment
 * ended early cancels the doses that hadn't come; specs/020 — doses added to the end count like any other).
 */
export function medicationDays(medication: Medication): string[] {
  return [...new Set(medication.doses.filter((d) => d.status !== 'canceled').map((d) => dayKey(d.scheduledAt)))].sort()
}

/**
 * From the first to the last day with doses to take — the start and the end of the treatment (specs/020). An ended
 * treatment ends on its last day with a dose that was not canceled; one ended before its first dose has none.
 */
export function medicationRange(medication: Medication): Range | null {
  const days = medicationDays(medication)
  return days.length === 0 ? null : { start: days[0], end: days[days.length - 1] }
}

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
  /** First and last day with doses to take; null when it has none. */
  range: Range | null
  /** Every day with doses to take. */
  days: Set<string>
}

export const numbered = (medications: Medication[]): NumberedMedication[] =>
  medications.map((medication, i) => {
    const days = medicationDays(medication)
    return {
      number: i + 1,
      medication,
      range: days.length === 0 ? null : { start: days[0], end: days[days.length - 1] },
      days: new Set(days),
    }
  })

/** What a medication is on a day it has doses: where its treatment starts, ends, both (one day) or neither. */
export type MarkRole = 'start' | 'end' | 'both' | 'mid'

export interface DayMark {
  number: number
  role: MarkRole
}

/** The marks of a day, in the order of the medications: only those that have doses to take that day (specs/020). */
export const marksOn = (day: string, meds: NumberedMedication[]): DayMark[] =>
  meds.flatMap((m) => {
    if (!m.range || !m.days.has(day)) return []
    const first = day === m.range.start
    const last = day === m.range.end
    return [{ number: m.number, role: first && last ? 'both' : first ? 'start' : last ? 'end' : 'mid' } as DayMark]
  })

/** How a mark is said in the name of a day: "inicio de 1 Amoxicilina", "fin de …", "inicio y fin de …" or just "1 …". */
export const markLabel = (mark: DayMark, name: string): string => {
  const prefix = { start: 'inicio de ', end: 'fin de ', both: 'inicio y fin de ', mid: '' }[mark.role]
  return `${prefix}${mark.number} ${name}`
}

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
    .sort((a, b) => Date.parse(a.dose.scheduledAt) - Date.parse(b.dose.scheduledAt) || a.number - b.number)
}

/** The most doses one extension may add (the backend's `MaxExtensionDoses`, specs/020). */
export const MAX_EXTENSION_DOSES = 60

/** A whole number from 1 to 60 typed as text, or null. */
export function parseDoses(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null
  const n = Number(text)
  return n >= 1 && n <= MAX_EXTENSION_DOSES ? n : null
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
