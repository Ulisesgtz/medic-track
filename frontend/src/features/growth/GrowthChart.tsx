import { useState } from 'react'
import { formatDateShort } from '../../shared/date'
import { ageAt } from './growthAge'
import { GROWTH, heightText, pointLabel, weightText } from './growthText'
import { xMaxFor, yRangeFor } from './chartScale'
import type { Curve, GrowthChart as Chart, Indicator } from './types'

const PERCENTILES = ['p97', 'p85', 'p50', 'p15', 'p3'] as const
type Percentile = (typeof PERCENTILES)[number]
const LABEL: Record<Percentile, string> = { p97: 'P97', p85: 'P85', p50: 'P50', p15: 'P15', p3: 'P3' }
// The reference is grey in every case: P50 a little darker, the outer ones lighter. Never a color that reads as good or bad.
const OPACITY: Record<Percentile, number> = { p97: 0.45, p85: 0.65, p50: 0.95, p15: 0.65, p3: 0.45 }

interface GrowthChartProps {
  chart: Chart
  indicator: Indicator
  desktop: boolean
}

/**
 * The growth chart (specs/063, research R5): own SVG, no library. The child's points (action) joined in the order of time, over the
 * WHO's P3–P97 in grey with their technical names only. Tapping a point says its date, value and age. A table with the same
 * measurements follows for screen readers and for who doesn't read charts. Nothing computes where the child stands (Principio I).
 */
export function GrowthChart({ chart, indicator, desktop }: GrowthChartProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const points = chart.points[indicator]
  const reference: Curve | null = chart.reference?.available ? chart.reference[indicator] : null
  const xMax = xMaxFor(points)
  const curves = reference ? reference.curves.filter((c) => c.months <= xMax) : []
  const y = yRangeFor(points, curves)

  const W = desktop ? 720 : 340
  const H = desktop ? 360 : 260
  const pad = { l: 40, r: 34, t: 14, b: 34 }
  const px = (months: number) => pad.l + (months / xMax) * (W - pad.l - pad.r)
  const py = (value: number) => H - pad.b - ((value - y.min) / (y.max - y.min)) * (H - pad.t - pad.b)
  const unit = indicator === 'weight' ? weightText : heightText
  const inYears = xMax > 24
  const xStep = inYears ? 12 : 3
  const xTicks = Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, i) => i * xStep)
  const yTicks = Array.from({ length: Math.round((y.max - y.min) / y.step) + 1 }, (_, i) => y.min + i * y.step)
  const beyond = reference && points.some((p) => p.months > reference.maxMonths)
  const chosen = picked !== null ? points[picked] : null

  return (
    <div className="flex flex-col gap-3">
      <figure className="m-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`${indicator === 'weight' ? GROWTH.weight : GROWTH.height}: ${points.length} medidas`}
          className="block h-auto"
        >
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={pad.l} x2={W - pad.r} y1={py(v)} y2={py(v)} className="stroke-skel" strokeWidth={1} />
              <text x={pad.l - 6} y={py(v) + 4} textAnchor="end" className="fill-muted text-[11px]">
                {v}
              </text>
            </g>
          ))}
          {xTicks.map((m) => (
            <text key={`x${m}`} x={px(m)} y={H - pad.b + 16} textAnchor="middle" className="fill-muted text-[11px]">
              {inYears ? m / 12 : m}
            </text>
          ))}
          <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" className="fill-muted text-[11px]">
            {inYears ? GROWTH.years : GROWTH.months}
          </text>
          {curves.length > 1 &&
            PERCENTILES.map((p) => {
              const last = curves[curves.length - 1]
              return (
                <g key={p} data-testid={`curve-${p}`}>
                  <polyline
                    points={curves.map((c) => `${px(c.months)},${py(c[p])}`).join(' ')}
                    fill="none"
                    className="stroke-calendar-muted"
                    strokeOpacity={OPACITY[p]}
                    strokeWidth={p === 'p50' ? 1.6 : 1.2}
                  />
                  <text x={px(last.months) + 4} y={py(last[p]) + 4} className="fill-muted text-[10px]">
                    {LABEL[p]}
                  </text>
                </g>
              )
            })}
          {points.length > 1 && (
            <polyline points={points.map((p) => `${px(p.months)},${py(p.value)}`).join(' ')} fill="none" className="stroke-action" strokeWidth={2} />
          )}
          {points.map((p, i) => (
            <g key={`${p.measuredOn}-${i}`} onClick={() => setPicked(i === picked ? null : i)} className="cursor-pointer" data-testid="growth-point">
              <circle cx={px(p.months)} cy={py(p.value)} r={22} fill="transparent" />
              <circle cx={px(p.months)} cy={py(p.value)} r={i === picked ? 6 : 4.5} className="fill-action stroke-surface" strokeWidth={2} />
            </g>
          ))}
        </svg>
        {chosen && (
          <figcaption aria-live="polite" className="mt-1 text-center text-[14px] font-bold text-ink">
            {pointLabel(chosen.measuredOn, indicator, chosen.value, ageAt(chart.birthDate, chosen.measuredOn))}
          </figcaption>
        )}
      </figure>
      {points.length === 0 && <p className="text-[14px] text-body">{GROWTH.noPoints(indicator)}</p>}
      {beyond && <p className="text-[13px] leading-normal text-body">{indicator === 'weight' ? GROWTH.beyondWeight : GROWTH.beyondHeight}</p>}
      {chart.reference?.available && <p className="text-[13px] leading-normal text-muted">{chart.reference.source}</p>}
      {points.length > 0 && (
        <table className="w-full text-left text-[14px]">
          <caption className="sr-only">{GROWTH.tableCaption(indicator)}</caption>
          <thead>
            <tr className="text-[12px] text-muted">
              <th scope="col" className="py-1 font-bold">
                {GROWTH.date}
              </th>
              <th scope="col" className="py-1 font-bold">
                {GROWTH.ageColumn}
              </th>
              <th scope="col" className="py-1 text-right font-bold">
                {GROWTH.valueColumn(indicator)}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={`${p.measuredOn}-${i}`} className="border-t border-hint-edge text-body">
                <td className="py-1.5">{formatDateShort(p.measuredOn)}</td>
                <td className="py-1.5">{ageAt(chart.birthDate, p.measuredOn)}</td>
                <td className="py-1.5 text-right font-bold text-ink">{unit(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
