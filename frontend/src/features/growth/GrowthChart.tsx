import type { MouseEvent } from 'react'
import { layout, nearestIndex, scale, smoothPath, spreadLabels, xTicks, type YAxis } from './chartModel'
import type { ChartPoint, CurvePoint, Indicator } from './types'

const PERCENTILES = ['p3', 'p15', 'p50', 'p85', 'p97'] as const
const NAMES = { p3: 'P3', p15: 'P15', p50: 'P50', p85: 'P85', p97: 'P97' } as const

interface GrowthChartProps {
  desktop: boolean
  indicator: Indicator
  /** Only the points inside the range, in order of age. */
  points: ChartPoint[]
  /** Only the reference inside the range; empty without a reference. */
  curves: CurvePoint[]
  xMax: number
  y: YAxis
  selected: number | null
  onPick: (index: number) => void
  name: string
}

/**
 * The growth chart drawn as the mock of spec 065 (`svg()` in referencia/Crecimiento PediTrack.dc.html): a horizontal grid, the value
 * axis with its unit on top, the age axis in «meses» and «años» with a longer mark at two years, the WHO's P3–P97 as thin grey lines
 * named only at their end, and the child's line — the only one in color and the only one with points — with the chosen point larger,
 * ringed and with a dotted guide. Tapping anywhere on the plot picks the closest measurement; ‹ › do the same from the card. Nothing
 * here says where the child stands (Principio I).
 */
export function GrowthChart({ desktop, indicator, points, curves, xMax, y, selected, onPick, name }: GrowthChartProps) {
  const l = layout(desktop)
  const s = scale(l, xMax, y)
  const axis = xTicks(xMax)
  const bottom = l.T + s.plotHeight
  const xs = points.map((p) => s.x(p.months))
  const ys = points.map((p) => s.y(p.value))
  const chosen = selected != null && selected < points.length ? selected : null

  const lines = PERCENTILES.map((key) => curves.map((c): [number, number] => [s.x(c.months), s.y(c[key])]))
  const labelYs = curves.length ? spreadLabels(lines.map((pts) => pts[pts.length - 1][1]), l.fs + 1) : []
  // The names go at the curves' own end (before the range's end when the child is older than the reference).
  const labelX = curves.length ? s.x(curves[curves.length - 1].months) + 6 : 0

  const pick = (e: MouseEvent<SVGRectElement>) => {
    if (points.length === 0) return
    const svg = e.currentTarget.ownerSVGElement
    const box = svg?.getBoundingClientRect()
    const x = box && box.width > 0 ? ((e.clientX - box.left) * l.W) / box.width : e.clientX
    onPick(nearestIndex(xs, x))
  }

  return (
    <svg
      viewBox={`0 0 ${l.W} ${l.H}`}
      role="img"
      aria-label={name}
      data-indicator={indicator}
      className="block h-auto w-full font-sans"
      style={{ maxWidth: l.W }}
    >
      <g>
        {y.ticks.map((v) => (
          <line key={v} x1={l.L} x2={l.L + s.plotWidth} y1={s.y(v)} y2={s.y(v)} className="stroke-grid" strokeWidth={1} />
        ))}
      </g>
      <g>
        {y.ticks.map((v) => (
          <text key={v} x={l.L - 8} y={s.y(v) + l.fs * 0.35} textAnchor="end" fontSize={l.fs} fontWeight={600} className="fill-muted">
            {String(v)}
          </text>
        ))}
      </g>
      <text x={l.L - 8} y={l.T - 12} textAnchor="end" fontSize={l.fs} fontWeight={800} className="fill-body">
        {indicator === 'weight' ? 'kg' : 'cm'}
      </text>
      <line x1={l.L} x2={l.L + s.plotWidth} y1={bottom} y2={bottom} className="stroke-curve" strokeWidth={1} />
      <g>
        {axis.ticks.map((t) => (
          <g key={t.months}>
            <line x1={s.x(t.months)} x2={s.x(t.months)} y1={bottom} y2={bottom + (t.long ? 12 : 5)} className="stroke-curve" strokeWidth={t.long ? 1.5 : 1} />
            <text x={s.x(t.months)} y={bottom + l.fs + 8} textAnchor="middle" fontSize={l.fs} fontWeight={600} className="fill-muted">
              {t.label}
            </text>
          </g>
        ))}
      </g>
      <g>
        {axis.units.map((u) => (
          <text key={u.label} x={s.x(u.at)} y={bottom + l.fs * 2 + 14} textAnchor="middle" fontSize={l.fs} fontWeight={800} className="fill-body">
            {u.label}
          </text>
        ))}
      </g>
      <g data-testid="who-curves">
        {lines.map((pts, i) =>
          pts.length ? <path key={PERCENTILES[i]} d={smoothPath(pts)} fill="none" className="stroke-curve" strokeWidth={1.5} /> : null,
        )}
      </g>
      <g>
        {labelYs.map((ly, i) => (
          <text key={PERCENTILES[i]} x={labelX} y={ly + l.fs * 0.35} fontSize={l.fs} fontWeight={700} className="fill-muted">
            {NAMES[PERCENTILES[i]]}
          </text>
        ))}
      </g>
      {points.length > 1 && (
        <polyline
          points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
          fill="none"
          className="stroke-action"
          strokeWidth={l.line}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <g data-testid="child-points">
        {points.map((p, i) =>
          i === chosen ? null : <circle key={`${p.measuredOn}-${i}`} cx={xs[i]} cy={ys[i]} r={l.r} className="fill-action stroke-surface" strokeWidth={2} />,
        )}
      </g>
      {chosen != null && (
        <g data-testid="chosen-point">
          <line x1={xs[chosen]} x2={xs[chosen]} y1={l.T} y2={bottom} className="stroke-action" strokeWidth={1} strokeDasharray="3 4" />
          <circle cx={xs[chosen]} cy={ys[chosen]} r={l.r + 3} className="fill-surface stroke-action" strokeWidth={3} />
          <circle cx={xs[chosen]} cy={ys[chosen]} r={l.r - 1.5} className="fill-action" />
        </g>
      )}
      <rect
        data-testid="chart-hit"
        x={l.L}
        y={l.T}
        width={s.plotWidth}
        height={s.plotHeight}
        fill="transparent"
        className="cursor-pointer"
        onClick={pick}
      />
    </svg>
  )
}
