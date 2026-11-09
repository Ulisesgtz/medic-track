import type { ChartPoint, CurvePoint } from './types'

// specs/063: the axes of the growth chart (pure, so they are tested apart from the drawing).

/** The months shown: at least two years, then whole years past the last measurement. */
export function xMaxFor(points: ChartPoint[]): number {
  const last = points.reduce((m, p) => Math.max(m, p.months), 0)
  return last <= 22 ? 24 : Math.ceil((last + 2) / 12) * 12
}

/** A tidy step for the value axis (1, 2, 5, 10, 20…). */
function niceStep(span: number, ticks: number): number {
  const raw = span / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow
}

export function yRangeFor(points: ChartPoint[], curves: CurvePoint[]): { min: number; max: number; step: number } {
  const values = [...points.map((p) => p.value), ...curves.flatMap((c) => [c.p3, c.p97])]
  if (values.length === 0) return { min: 0, max: 10, step: 2 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const step = niceStep(Math.max(hi - lo, 1), 5)
  const min = Math.max(0, Math.floor(lo / step) * step)
  const max = Math.ceil(hi / step) * step
  // One value alone still needs room above and below to be drawn.
  return max > min ? { min, max, step } : { min: Math.max(0, min - 2 * step), max: max + 2 * step, step }
}
