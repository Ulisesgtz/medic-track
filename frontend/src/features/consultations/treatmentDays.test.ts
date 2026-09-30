import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  dayKey,
  dosesOn,
  MAX_EXTENSION_DOSES,
  parseDoses,
  initialDay,
  markLabel,
  marksOn,
  medBg,
  medicationRange,
  monthGrid,
  monthOfDay,
  monthsOf,
  numbered,
  treatmentSpan,
} from './treatmentDays'
import type { Medication } from './types'

beforeEach(() => vi.stubEnv('TZ', 'America/Mexico_City'))
afterEach(() => vi.unstubAllEnvs())

// Local (Mexico City, UTC-6 all year since 2022) times as instants.
const at = (day: string, time: string) => new Date(`${day}T${time}:00-06:00`).toISOString()

function med(name: string, times: [string, string][], endedAt: string | null = null): Medication {
  return {
    id: name,
    name,
    frequencyHours: 8,
    durationDays: 1,
    startTime: null,
    endedAt,
    extendableDoses: 0,
    extensions: [],
    // The server cancels the unmarked doses that come after the end; the fixtures say it the same way.
    doses: times.map(([day, time], i) => ({
      id: `${name}-${i}`,
      scheduledAt: at(day, time),
      taken: false,
      status: endedAt && new Date(at(day, time)) > new Date(endedAt) ? ('canceled' as const) : ('pending' as const),
    })),
  }
}

describe('dayKey (specs/019)', () => {
  it('reads the local day, not the UTC one', () => {
    // 22:00 in Mexico City is already the next day in UTC.
    expect(dayKey('2026-10-01T04:00:00Z')).toBe('2026-09-30')
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('medicationRange', () => {
  it('goes from the first to the last day of its doses (specs/020: the start and the end)', () => {
    const m = med('A', [['2026-09-30', '08:00'], ['2026-10-02', '16:00'], ['2026-10-01', '08:00']])
    expect(medicationRange(m)).toEqual({ start: '2026-09-30', end: '2026-10-02' })
  })

  it('marks only the days it has doses to take: a day in between with none (every 48 h) has no mark', () => {
    const meds = numbered([med('A', [['2026-09-30', '08:00'], ['2026-10-02', '08:00']])])
    expect(marksOn('2026-09-30', meds)).toEqual([{ number: 1, role: 'start' }])
    expect(marksOn('2026-10-01', meds)).toEqual([])
    expect(marksOn('2026-10-02', meds)).toEqual([{ number: 1, role: 'end' }])
  })

  it('ends on the last day with a dose that was not canceled when the treatment was ended early', () => {
    const m = med('A', [['2026-09-30', '08:00'], ['2026-10-01', '08:00'], ['2026-10-03', '08:00']], at('2026-10-01', '09:00'))
    expect(medicationRange(m)).toEqual({ start: '2026-09-30', end: '2026-10-01' })
  })

  it('an end whose day only had doses after it stops the day before', () => {
    const m = med('A', [['2026-09-30', '08:00'], ['2026-10-01', '16:00']], at('2026-10-01', '09:00'))
    expect(medicationRange(m)).toEqual({ start: '2026-09-30', end: '2026-09-30' })
  })

  it('an end after the last dose does not stretch it, and ending after the last day keeps it', () => {
    expect(medicationRange(med('A', [['2026-09-30', '08:00']], at('2026-10-05', '09:00')))).toEqual({ start: '2026-09-30', end: '2026-09-30' })
    expect(medicationRange(med('B', [['2026-09-30', '08:00'], ['2026-10-02', '08:00']], at('2026-10-02', '09:00')))).toEqual({
      start: '2026-09-30',
      end: '2026-10-02',
    })
  })

  it('a dose the parent marked after the end still counts: it was taken', () => {
    const m = med('A', [['2026-09-30', '08:00'], ['2026-10-03', '08:00']], at('2026-10-01', '09:00'))
    m.doses[1] = { ...m.doses[1], taken: true, status: 'taken' }
    expect(medicationRange(m)).toEqual({ start: '2026-09-30', end: '2026-10-03' })
  })

  it('doses added by an extension (specs/020) move the end', () => {
    const m = med('A', [['2026-09-30', '08:00'], ['2026-10-01', '08:00']])
    const before = medicationRange(m)
    m.doses.push({ id: 'added-1', scheduledAt: at('2026-10-03', '08:00'), taken: false, status: 'pending' })
    expect(before).toEqual({ start: '2026-09-30', end: '2026-10-01' })
    expect(medicationRange(m)).toEqual({ start: '2026-09-30', end: '2026-10-03' })
  })

  it('has none when it was ended before its first day, or has no doses', () => {
    expect(medicationRange(med('A', [['2026-10-05', '08:00']], at('2026-10-01', '09:00')))).toBeNull()
    expect(medicationRange(med('B', []))).toBeNull()
  })
})

describe('marks, colors and numbering', () => {
  const meds = numbered([
    med('Amoxicilina', [['2026-09-30', '08:00'], ['2026-10-06', '08:00']]),
    med('Paracetamol', [['2026-09-30', '08:00'], ['2026-10-02', '08:00']]),
  ])

  it('numbers by the place in the consultation', () => {
    expect(meds.map((m) => m.number)).toEqual([1, 2])
  })

  it('a day carries the mark of every medication that has doses that day, with its role, none outside', () => {
    // Amoxicilina has doses on Sep 30, Oct 3 and Oct 6; Paracetamol on Sep 30 and Oct 2.
    const every = numbered([
      med('Amoxicilina', [['2026-09-30', '08:00'], ['2026-10-01', '08:00'], ['2026-10-02', '08:00'], ['2026-10-06', '08:00']]),
      med('Paracetamol', [['2026-09-30', '08:00'], ['2026-10-02', '08:00']]),
    ])
    expect(marksOn('2026-09-30', every)).toEqual([{ number: 1, role: 'start' }, { number: 2, role: 'start' }])
    expect(marksOn('2026-10-01', every)).toEqual([{ number: 1, role: 'mid' }])
    expect(marksOn('2026-10-02', every)).toEqual([{ number: 1, role: 'mid' }, { number: 2, role: 'end' }])
    expect(marksOn('2026-10-06', every)).toEqual([{ number: 1, role: 'end' }])
    expect(marksOn('2026-10-07', every)).toEqual([])
    expect(marksOn('2026-09-29', every)).toEqual([])
    // A treatment of one day starts and ends that day.
    expect(marksOn('2026-10-01', numbered([med('Zinc', [['2026-10-01', '08:00']])]))).toEqual([{ number: 1, role: 'both' }])
  })

  it('names the marks for the day: start, end, both or nothing', () => {
    expect(markLabel({ number: 1, role: 'start' }, 'Amoxicilina')).toBe('inicio de 1 Amoxicilina')
    expect(markLabel({ number: 2, role: 'end' }, 'Paracetamol')).toBe('fin de 2 Paracetamol')
    expect(markLabel({ number: 3, role: 'both' }, 'Zinc')).toBe('inicio y fin de 3 Zinc')
    expect(markLabel({ number: 4, role: 'mid' }, 'Loratadina')).toBe('4 Loratadina')
  })

  it('colors repeat from the 7th medication on', () => {
    expect(medBg(1)).toBe('bg-med-1')
    expect(medBg(6)).toBe('bg-med-6')
    expect(medBg(7)).toBe('bg-med-1')
    expect(medBg(8)).toBe('bg-med-2')
  })

  it('the span covers every medication; none when no medication has a range', () => {
    expect(treatmentSpan(meds)).toEqual({ start: '2026-09-30', end: '2026-10-06' })
    expect(treatmentSpan(numbered([med('A', [])]))).toBeNull()
  })
})

describe('months and grid', () => {
  it('lists every month of the span, across a year change', () => {
    expect(monthsOf({ start: '2026-09-30', end: '2026-09-30' })).toEqual([{ year: 2026, month: 8 }])
    expect(monthsOf({ start: '2026-09-30', end: '2026-10-06' })).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ])
    expect(monthsOf({ start: '2026-11-20', end: '2027-02-03' }).map((m) => `${m.year}-${m.month + 1}`)).toEqual([
      '2026-11',
      '2026-12',
      '2027-1',
      '2027-2',
    ])
  })

  it('draws the weeks Monday first and completes the first and last week with the neighbouring months', () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    const grid = monthGrid({ year: 2026, month: 8 })
    expect(grid).toHaveLength(5)
    expect(grid.every((week) => week.length === 7)).toBe(true)
    expect(grid[0][0]).toEqual({ key: '2026-08-31', day: 31, inMonth: false })
    expect(grid[0][1]).toEqual({ key: '2026-09-01', day: 1, inMonth: true })
    expect(grid[4][2]).toEqual({ key: '2026-09-30', day: 30, inMonth: true })
    expect(grid[4][3]).toEqual({ key: '2026-10-01', day: 1, inMonth: false })
  })

  it('a month that starts on a Monday has no leading days; one that ends on a Sunday has no trailing days', () => {
    // June 2026 starts on a Monday; August 2026 ends on a Monday, March 2026 starts on Sunday.
    expect(monthGrid({ year: 2026, month: 5 })[0][0]).toEqual({ key: '2026-06-01', day: 1, inMonth: true })
    const march = monthGrid({ year: 2026, month: 2 })
    expect(march[0].filter((d) => !d.inMonth)).toHaveLength(6)
    expect(march[0][6]).toEqual({ key: '2026-03-01', day: 1, inMonth: true })
  })

  it('knows a leap February and a six-week month', () => {
    const feb = monthGrid({ year: 2028, month: 1 })
    expect(feb.flat().filter((d) => d.inMonth)).toHaveLength(29)
    // August 2026 starts on a Saturday: 6 weeks.
    expect(monthGrid({ year: 2026, month: 7 })).toHaveLength(6)
  })

  it('names the month of a day', () => {
    expect(monthOfDay('2026-10-06')).toEqual({ year: 2026, month: 9 })
  })
})

describe('parseDoses (specs/020)', () => {
  it('accepts whole numbers from 1 to 60 and nothing else', () => {
    expect(MAX_EXTENSION_DOSES).toBe(60)
    expect(parseDoses('1')).toBe(1)
    expect(parseDoses('60')).toBe(60)
    expect(parseDoses(' 7 ')).toBe(7)
    for (const bad of ['', '0', '61', '100', '1000', '-3', '2.5', '3e1', 'tres', ' ']) {
      expect(parseDoses(bad), bad).toBeNull()
    }
  })
})

describe('initialDay', () => {
  const meds = numbered([med('A', [['2026-09-30', '08:00'], ['2026-10-06', '08:00']])])

  it('is today when it falls inside the treatment, otherwise its first day', () => {
    expect(initialDay(meds, '2026-10-02')).toBe('2026-10-02')
    expect(initialDay(meds, '2026-09-30')).toBe('2026-09-30')
    expect(initialDay(meds, '2026-10-06')).toBe('2026-10-06')
    expect(initialDay(meds, '2026-09-01')).toBe('2026-09-30')
    expect(initialDay(meds, '2026-12-01')).toBe('2026-09-30')
  })

  it('is null when there is nothing to show', () => {
    expect(initialDay(numbered([med('A', [])]), '2026-10-02')).toBeNull()
  })
})

describe('dosesOn', () => {
  it('joins the doses of every medication of the day, by time, keeping each one\'s number', () => {
    const a = med('Amoxicilina', [['2026-09-30', '16:00'], ['2026-09-30', '08:00'], ['2026-10-01', '08:00']])
    const b = med('Paracetamol', [['2026-09-30', '12:00'], ['2026-09-30', '08:00']])

    const day = dosesOn('2026-09-30', [a, b])

    expect(day.map((d) => [d.medication.name, d.number, new Date(d.dose.scheduledAt).getHours()])).toEqual([
      ['Amoxicilina', 1, 8],
      ['Paracetamol', 2, 8],
      ['Paracetamol', 2, 12],
      ['Amoxicilina', 1, 16],
    ])
  })

  it('is empty on a day with no doses', () => {
    expect(dosesOn('2026-12-25', [med('A', [['2026-09-30', '08:00']])])).toEqual([])
  })
})
