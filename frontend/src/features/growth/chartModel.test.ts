import { describe, expect, it } from 'vitest'
import {
  axisValues,
  fullRangeMonths,
  layout,
  nearestIndex,
  rangeLabel,
  scale,
  shortRangeMonths,
  smoothPath,
  spreadLabels,
  visibleCurves,
  visiblePoints,
  wholeYears,
  xTicks,
  yAxis,
} from './chartModel'

// The mock's data: Mateo, born 12 Sep 2024, «today» 24 Oct 2026 (specs/065 referencia).
const BIRTH = '2024-09-12'
const TODAY = '2026-10-24'

describe('chartModel — sizes and ranges of the mock', () => {
  it('draws at the mock’s sizes', () => {
    expect(layout(false)).toEqual({ W: 316, H: 264, L: 36, R: 40, T: 28, B: 50, fs: 13, line: 2.5, r: 5 })
    expect(layout(true)).toEqual({ W: 854, H: 380, L: 48, R: 54, T: 30, B: 54, fs: 14, line: 3, r: 6 })
  })

  it('the short range goes to the whole year after the child’s age, never past the reference', () => {
    expect(wholeYears(BIRTH, TODAY)).toBe(2)
    expect(wholeYears(BIRTH, '2026-09-11')).toBe(1)
    expect(wholeYears(BIRTH, '2023-01-01')).toBe(0)
    expect(shortRangeMonths(BIRTH, TODAY, 120)).toBe(36)
    expect(shortRangeMonths('2026-05-01', TODAY, 120)).toBe(12)
    expect(shortRangeMonths('2015-01-01', TODAY, 120)).toBe(120)
    expect(shortRangeMonths('2015-01-01', TODAY, null)).toBe(144)
  })

  it('the full range is the reference, or the last measurement without one', () => {
    expect(fullRangeMonths(120, 36, 25)).toBe(120)
    expect(fullRangeMonths(228, 36, 25)).toBe(228)
    expect(fullRangeMonths(null, 36, 25)).toBe(36)
    expect(fullRangeMonths(null, 36, 50)).toBe(60)
  })

  it('names the ranges as the mock', () => {
    expect(rangeLabel('short', 36, true)).toBe('0–3 años')
    expect(rangeLabel('short', 12, true)).toBe('0–1 año')
    expect(rangeLabel('full', 120, true)).toBe('Hasta 10 años')
    expect(rangeLabel('full', 228, true)).toBe('Hasta 19 años')
    expect(rangeLabel('full', 60, false)).toBe('Todo')
  })
})

describe('chartModel — the age axis', () => {
  const labels = (xMax: number) => xTicks(xMax).ticks.map((t) => t.label)
  it('0–3 years: months to two years, then years, the mark at 24 longer', () => {
    const axis = xTicks(36)
    expect(axis.ticks.map((t) => t.label)).toEqual(['0', '6', '12', '18', '2', '3'])
    expect(axis.ticks.find((t) => t.months === 24)?.long).toBe(true)
    expect(axis.ticks.filter((t) => t.long)).toHaveLength(1)
    expect(axis.units).toEqual([
      { label: 'meses', at: 12 },
      { label: 'años', at: 30 },
    ])
  })
  it('the whole references (as the mock)', () => {
    expect(labels(120)).toEqual(['0', '12', '2', '4', '6', '8', '10'])
    expect(xTicks(120).units[1]).toEqual({ label: 'años', at: 72 })
    expect(labels(228)).toEqual(['0', '2', '5', '10', '15', '19'])
    expect(xTicks(228).units[1]).toEqual({ label: 'años', at: 126 })
  })
  it('short ranges of a baby and of a few years', () => {
    expect(labels(12)).toEqual(['0', '3', '6', '9', '12'])
    expect(xTicks(12).units).toEqual([{ label: 'meses', at: 6 }])
    expect(labels(24)).toEqual(['0', '6', '12', '18', '24'])
    expect(labels(60)).toEqual(['0', '12', '2', '3', '4', '5'])
    expect(labels(192)).toEqual(['0', '2', '5', '10', '16'])
  })
})

describe('chartModel — the value axis', () => {
  it('kg in 0–3 years, as the mock: 2 to 18 with 4, 8, 12, 16', () => {
    expect(yAxis([2.5, 17.8, 4.4, 11.4])).toEqual({ y0: 2, y1: 18, ticks: [4, 8, 12, 16] })
  })
  it('cm in 0–3 years: steps of 10', () => {
    const y = yAxis([46.3, 102.7, 54, 82])
    expect(y.ticks).toEqual([50, 60, 70, 80, 90, 100])
    expect(y.y0).toBe(45)
    expect(y.y1).toBe(105)
  })
  it('the whole weight reference and nothing to draw', () => {
    expect(yAxis([2.5, 44])).toEqual({ y0: 0, y1: 45, ticks: [10, 20, 30, 40] })
    expect(yAxis([])).toEqual({ y0: 0, y1: 10, ticks: [2, 4, 6, 8, 10] })
  })
  it('one value alone still has room', () => {
    const y = yAxis([10])
    expect(y.y1).toBeGreaterThan(y.y0)
  })
  it('takes the reference’s ends and the points', () => {
    expect(axisValues([{ measuredOn: 'x', months: 1, value: 5 }], [{ months: 0, p3: 2, p15: 3, p50: 4, p85: 5, p97: 6 }])).toEqual([5, 2, 6])
  })
})

describe('chartModel — what is shown, where, and the nearest point', () => {
  const p = (months: number, value = 10) => ({ measuredOn: '2026-01-01', months, value })
  it('keeps the points and curves of the range, in order', () => {
    expect(visiblePoints([p(40), p(5), p(36)], 36).map((x) => x.months)).toEqual([5, 36])
    expect(visibleCurves([{ months: 36, p3: 1, p15: 1, p50: 1, p85: 1, p97: 1 }, { months: 48, p3: 1, p15: 1, p50: 1, p85: 1, p97: 1 }], 36)).toHaveLength(1)
  })
  it('maps months and values onto the plot', () => {
    const s = scale(layout(false), 36, { y0: 2, y1: 18, ticks: [] })
    expect(s.plotWidth).toBe(240)
    expect(s.plotHeight).toBe(186)
    expect(s.x(0)).toBe(36)
    expect(s.x(36)).toBe(276)
    expect(s.y(18)).toBe(28)
    expect(s.y(2)).toBe(214)
  })
  it('picks the closest x', () => {
    expect(nearestIndex([10, 50, 90], 61)).toBe(1)
    expect(nearestIndex([10, 50, 90], 80)).toBe(2)
    expect(nearestIndex([10], 300)).toBe(0)
  })
  it('smooths a curve through its points and keeps the names apart', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([[0, 0], [10, 10]])).toBe('M0.0 0.0 C1.7 1.7 8.3 8.3 10.0 10.0')
    expect(smoothPath([[0, 0], [10, 10], [20, 0]]).split(' C')).toHaveLength(3)
    expect(spreadLabels([100, 95, 104, 40], 14)).toEqual([109, 95, 123, 40])
  })
})
