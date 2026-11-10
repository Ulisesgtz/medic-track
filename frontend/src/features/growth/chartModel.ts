import type { ChartPoint, CurvePoint } from './types'

// specs/065: the pure part of the growth chart — the mock's sizes, the age range, the axes, the scale, the nearest point and the
// smoothed WHO curves (research R8). Nothing here looks at where the child stands (Principio I): only positions on the drawing.

export interface ChartLayout {
  W: number
  H: number
  L: number
  R: number
  T: number
  B: number
  /** Font size of the axes and the curves' names. */
  fs: number
  /** Stroke of the child's line. */
  line: number
  /** Radius of the child's points. */
  r: number
}

/** The mock's drawing: 316×264 on the phone, 854×380 on the web («Medidas y decisiones»). */
export function layout(desktop: boolean): ChartLayout {
  return desktop
    ? { W: 854, H: 380, L: 48, R: 54, T: 30, B: 54, fs: 14, line: 3, r: 6 }
    : { W: 316, H: 264, L: 36, R: 40, T: 28, B: 50, fs: 13, line: 2.5, r: 5 }
}

export type RangeKind = 'short' | 'full'

/** Whole years of age today (the birthday decides). */
export function wholeYears(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [y, m, d] = today.split('-').map(Number)
  let years = y - by
  if (m < bm || (m === bm && d < bd)) years -= 1
  return Math.max(years, 0)
}

/** The default range: from birth to the whole year after the child's age, never past the reference's end. */
export function shortRangeMonths(birthDate: string, today: string, refMax: number | null): number {
  const months = 12 * (wholeYears(birthDate, today) + 1)
  return refMax != null ? Math.min(months, refMax) : months
}

/** The whole reference (120 months of weight, 228 of height); with no reference, up to the last measurement. */
export function fullRangeMonths(refMax: number | null, shortMonths: number, lastPointMonths: number): number {
  if (refMax != null) return refMax
  return Math.max(shortMonths, Math.ceil(lastPointMonths / 12) * 12)
}

/** «0–3 años», «0–1 año», «Hasta 10 años», «Hasta 19 años» or «Todo» without a reference. */
export function rangeLabel(kind: RangeKind, months: number, hasReference: boolean): string {
  const years = Math.round(months / 12)
  if (kind === 'short') return years === 1 ? '0–1 año' : `0–${years} años`
  return hasReference ? `Hasta ${years} años` : 'Todo'
}

export interface XTick {
  months: number
  label: string
  /** The mark at two years is longer: it separates the months from the years. */
  long: boolean
}

export interface XAxis {
  ticks: XTick[]
  units: { label: 'meses' | 'años'; at: number }[]
}

/** Months are written as months before two years and as years from two years on. */
const tick = (months: number): XTick => ({ months, label: months < 24 ? String(months) : String(months / 12), long: months === 24 })

/**
 * The marks of the age axis, as the mock: months up to two years and years after. Up to a year, every 3 months; up to three years,
 * every 6 months to 24 and then each year; longer, 0, 12 (only with a small step), 2 and then years at a step that keeps it short.
 */
export function xTicks(xMax: number): XAxis {
  if (xMax <= 24) {
    const step = xMax <= 12 ? 3 : 6
    const ticks: XTick[] = []
    for (let m = 0; m <= xMax; m += step) ticks.push({ months: m, label: String(m), long: m === 24 })
    return { ticks, units: [{ label: 'meses', at: xMax / 2 }] }
  }
  if (xMax <= 36) {
    const ticks = [0, 6, 12, 18].map(tick)
    for (let m = 24; m <= xMax; m += 12) ticks.push(tick(m))
    return { ticks, units: [{ label: 'meses', at: 12 }, { label: 'años', at: (24 + xMax) / 2 }] }
  }
  const lastYear = xMax / 12
  const step = [1, 2, 5].find((s) => (lastYear - 2) / s <= 4) ?? 10
  const ticks: XTick[] = [tick(0)]
  if (step <= 2) ticks.push(tick(12))
  ticks.push(tick(24))
  for (let y = Math.ceil(3 / step) * step; y < lastYear; y += step) if (y > 2) ticks.push(tick(y * 12))
  const last = ticks[ticks.length - 1].months / 12
  if (lastYear - last < step / 2 && last > 2) ticks.pop()
  ticks.push(tick(xMax))
  return { ticks, units: [{ label: 'meses', at: 12 }, { label: 'años', at: (24 + xMax) / 2 }] }
}

export interface YAxis {
  y0: number
  y1: number
  ticks: number[]
}

const STEPS = [0.5, 1, 2, 4, 5, 10, 20, 40, 50, 100]

/** The value axis around what is drawn: a tidy step for about six lines, the ends rounded out to half a step. */
export function yAxis(values: number[]): YAxis {
  if (values.length === 0) return { y0: 0, y1: 10, ticks: [2, 4, 6, 8, 10] }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const step = STEPS.find((s) => s >= Math.max(hi - lo, 1) / 6) ?? 100
  const half = step / 2
  const y0 = Math.max(0, Math.floor(lo / half) * half)
  let y1 = Math.ceil(hi / half) * half
  if (y1 <= y0) y1 = y0 + step
  const ticks: number[] = []
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) if (v > y0 + 1e-9) ticks.push(Number(v.toFixed(2)))
  return { y0, y1, ticks }
}

/** The values the axis must hold: the reference's P3 and P97 inside the range and the points shown. */
export function axisValues(points: ChartPoint[], curves: CurvePoint[]): number[] {
  return [...points.map((p) => p.value), ...curves.flatMap((c) => [c.p3, c.p97])]
}

export function visiblePoints(points: ChartPoint[], xMax: number): ChartPoint[] {
  return points.filter((p) => p.months <= xMax + 1e-9).sort((a, b) => a.months - b.months)
}

export function visibleCurves(curves: CurvePoint[], xMax: number): CurvePoint[] {
  return curves.filter((c) => c.months <= xMax + 1e-9)
}

export interface Scale {
  x: (months: number) => number
  y: (value: number) => number
  plotWidth: number
  plotHeight: number
}

export function scale(l: ChartLayout, xMax: number, y: YAxis): Scale {
  const plotWidth = l.W - l.L - l.R
  const plotHeight = l.H - l.T - l.B
  return {
    plotWidth,
    plotHeight,
    x: (m) => l.L + (m / xMax) * plotWidth,
    y: (v) => l.T + (1 - (v - y.y0) / (y.y1 - y.y0)) * plotHeight,
  }
}

/** The index of the x closest to `x` (a tap anywhere on the plot picks the nearest measurement). */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0
  xs.forEach((v, i) => {
    if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i
  })
  return best
}

const f = (n: number) => n.toFixed(1)

/** A smooth line through the points (Catmull-Rom as cubic Béziers), as the mock draws the WHO curves. */
export function smoothPath(p: [number, number][]): string {
  if (p.length === 0) return ''
  let d = `M${f(p[0][0])} ${f(p[0][1])}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i]
    const b = p[i]
    const c = p[i + 1]
    const e = p[i + 2] ?? c
    d += ` C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`
  }
  return d
}

/** The names at the curves' ends, pushed apart so they never overlap (top to bottom, at least `gap` between them). */
export function spreadLabels(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < order.length; k++) if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap
  const out = new Array<number>(ys.length)
  order.forEach((o) => (out[o.i] = o.y))
  return out
}
