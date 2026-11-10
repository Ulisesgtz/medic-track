import { useRef, useState, type KeyboardEvent } from 'react'
import { GrowthChart } from './GrowthChart'
import { WhoNote, growthCard } from './GrowthCards'
import {
  axisValues,
  fullRangeMonths,
  rangeLabel,
  shortRangeMonths,
  visibleCurves,
  visiblePoints,
  yAxis,
  type RangeKind,
} from './chartModel'
import { ageAt } from './growthAge'
import { GROWTH, readingLine, readingMeta, valueText } from './growthText'
import type { GrowthChart as Chart, Indicator, ReferenceSex } from './types'

const REFERENCE_END: Record<Indicator, number> = { weight: 120, height: 228 }

interface ChartCardProps {
  chart: Chart
  childName: string
  today: string
  canEdit: boolean
  /** The family's owner, who chooses the WHO table (null: «la familia»). */
  ownerName: string | null
  desktop: boolean
  onChooseSex: (sex: ReferenceSex) => void
  choosingSex: boolean
  chooseFailed: boolean
}

/**
 * The chart's card of the mock (spec 065, states A, B and D): the Peso / Talla tabs, the age range, the reading of the chosen
 * measurement with ‹ ›, the drawing, the WHO table choice and the fixed note. The chosen measurement is the newest by default, goes
 * back to the newest when the tab changes and stays when the range changes if it is still shown (research R8). Nothing is kept on
 * leaving the screen.
 */
export function ChartCard({ chart, childName, today, canEdit, ownerName, desktop, onChooseSex, choosingSex, chooseFailed }: ChartCardProps) {
  const [indicator, setIndicator] = useState<Indicator>('weight')
  const [range, setRange] = useState<RangeKind>('short')
  // The chosen measurement by its date and its place among that day's (two can share a date).
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const reference = chart.reference
  const referenceOff = reference != null && !reference.available
  const noSex = chart.referenceSex == null
  const curveSet = reference?.available && !noSex ? reference[indicator] : null
  // The WHO reference's ends are fixed (weight to 10 years, height to 19): «Hasta 10 años» is offered before a table is chosen too.
  const refMax = curveSet?.maxMonths ?? (referenceOff ? null : REFERENCE_END[indicator])

  const allPoints = [...chart.points[indicator]].sort((a, b) => a.months - b.months)
  const lastMonths = allPoints.length ? allPoints[allPoints.length - 1].months : 0
  // A child older than the reference keeps their points: the range reaches the last measurement (drawn without curves past it).
  const cap = refMax == null ? null : Math.max(refMax, Math.ceil(lastMonths / 12) * 12)
  const shortMonths = shortRangeMonths(chart.birthDate, today, cap)
  const fullMonths = fullRangeMonths(cap, shortMonths, lastMonths)
  const fullIsReference = refMax != null && fullMonths === refMax
  const xMax = range === 'short' ? shortMonths : fullMonths
  const points = visiblePoints(allPoints, xMax)
  const curves = curveSet ? visibleCurves(curveSet.curves, xMax) : []
  const y = yAxis(axisValues(points, curves))

  const keys = points.map((p, i) => `${p.measuredOn}#${points.slice(0, i).filter((q) => q.measuredOn === p.measuredOn).length}`)
  const found = selectedKey == null ? -1 : keys.indexOf(selectedKey)
  const selected = points.length === 0 ? null : found >= 0 ? found : points.length - 1
  const point = selected == null ? null : points[selected]
  const age = point ? ageAt(chart.birthDate, point.measuredOn) : ''
  const choose = (i: number) => setSelectedKey(keys[i] ?? null)

  const switchTab = (next: Indicator) => {
    setIndicator(next)
    setSelectedKey(null)
  }
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next: Indicator = indicator === 'weight' ? 'height' : 'weight'
    switchTab(next)
    tabs.current[next === 'weight' ? 0 : 1]?.focus()
  }

  const ranges: { kind: RangeKind; label: string }[] = [
    { kind: 'short', label: rangeLabel('short', shortMonths, fullIsReference) },
    ...(fullMonths > shortMonths ? [{ kind: 'full' as const, label: rangeLabel('full', fullMonths, fullIsReference) }] : []),
  ]

  const tabList = (
    <div
      role="tablist"
      aria-label={GROWTH.tabsLabel}
      className={`grid grid-cols-2 gap-1 rounded-[14px] border border-hint-border bg-hint p-1 ${desktop ? 'w-[300px]' : ''}`}
    >
      {(['weight', 'height'] as const).map((k, i) => {
        const on = indicator === k
        return (
          <button
            key={k}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`growth-tab-${k}`}
            aria-selected={on}
            aria-controls="growth-tabpanel"
            tabIndex={on ? 0 : -1}
            onClick={() => switchTab(k)}
            onKeyDown={onTabKey}
            className={`min-h-11 cursor-pointer rounded-[11px] border-2 text-[16px] ${on ? 'border-action bg-surface font-extrabold text-ink' : 'border-transparent bg-transparent font-bold text-action'}`}
          >
            {k === 'weight' ? GROWTH.weight : GROWTH.height}
          </button>
        )
      })}
    </div>
  )

  const rangeGroup = (
    <div role="group" aria-label={GROWTH.rangeLabel} className="flex flex-wrap gap-2">
      {ranges.map((r) => {
        const on = range === r.kind
        return (
          <button
            key={r.kind}
            type="button"
            aria-pressed={on}
            onClick={() => setRange(r.kind)}
            className={`min-h-11 cursor-pointer rounded-full border-[1.5px] text-[15px] ${desktop ? 'px-[18px]' : 'px-4'} ${on ? 'border-ink bg-ink font-extrabold text-white' : 'border-hint-border bg-surface font-bold text-action'}`}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )

  const arrow = (dir: 'prev' | 'next') => {
    const disabled = selected == null || (dir === 'prev' ? selected === 0 : selected === points.length - 1)
    return (
      <button
        type="button"
        aria-label={dir === 'prev' ? GROWTH.previous : GROWTH.next}
        disabled={disabled}
        onClick={() => selected != null && choose(dir === 'prev' ? selected - 1 : selected + 1)}
        className={`flex size-11 flex-none cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-hint-border bg-surface text-[22px] font-extrabold text-action disabled:cursor-default ${disabled ? 'opacity-40' : ''}`}
      >
        {dir === 'prev' ? '‹' : '›'}
      </button>
    )
  }

  const reading =
    point == null ? (
      <p className={`text-body ${desktop ? 'text-[16px]' : 'text-[15px]'}`}>{GROWTH.noPoints(indicator)}</p>
    ) : desktop ? (
      <div aria-live="polite" className="flex items-center gap-3">
        {arrow('prev')}
        <span className="text-[18px] font-extrabold text-ink tabular-nums">{readingLine(point.measuredOn, indicator, point.value, age)}</span>
        {arrow('next')}
      </div>
    ) : (
      <div aria-live="polite" className="flex items-center gap-2 rounded-[14px] border border-hint-edge bg-canvas p-1.5">
        {arrow('prev')}
        <div className="flex min-w-0 flex-1 flex-col gap-px text-center">
          <span className="text-[18px] leading-[normal] font-black text-ink tabular-nums">{valueText(indicator, point.value)}</span>
          <span className="text-[14px] leading-[normal] font-medium text-body">{readingMeta(point.measuredOn, age)}</span>
        </div>
        {arrow('next')}
      </div>
    )

  const sexButton = (sex: ReferenceSex) => (
    <button
      key={sex}
      type="button"
      aria-pressed={false}
      disabled={choosingSex}
      onClick={() => onChooseSex(sex)}
      className={`min-h-11 cursor-pointer rounded-[14px] border-2 border-action bg-surface text-[15px] font-extrabold text-action hover:bg-hint ${desktop ? 'px-[22px]' : ''}`}
    >
      {sex === 'female' ? GROWTH.girls : GROWTH.boys}
    </button>
  )

  const invite =
    noSex && !referenceOff ? (
      canEdit ? (
        <div className={`flex rounded-[14px] border border-hint-border bg-hint ${desktop ? 'items-center gap-5 px-[18px] py-4' : 'flex-col gap-2 p-3.5'}`}>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`leading-[1.4] font-extrabold text-ink ${desktop ? 'text-[16px]' : 'text-[15px]'}`}>{GROWTH.inviteTitle}</span>
            <span className={`leading-[1.45] text-body ${desktop ? 'text-[15px]' : 'text-[14px]'}`}>{GROWTH.inviteBody(childName)}</span>
          </div>
          <div className={desktop ? 'flex flex-none gap-2' : 'grid grid-cols-2 gap-2'}>{(['female', 'male'] as const).map(sexButton)}</div>
        </div>
      ) : (
        <p className="text-[14px] leading-[1.45] text-body">{GROWTH.inviteReadOnly(childName, ownerName)}</p>
      )
    ) : null

  const sexPick =
    !noSex && !referenceOff && chart.referenceSex ? (
      canEdit ? (
        <div className={`flex ${desktop ? 'flex-none flex-col gap-1.5' : 'items-center justify-between gap-3'}`}>
          <span className="text-[14px] font-bold text-body">{GROWTH.tablePick}</span>
          <div role="group" aria-label={GROWTH.tableGroup} className="flex flex-none gap-1 rounded-[13px] border border-hint-border bg-hint p-[3px]">
            {(['female', 'male'] as const).map((sex) => {
              const on = chart.referenceSex === sex
              return (
                <button
                  key={sex}
                  type="button"
                  aria-pressed={on}
                  disabled={choosingSex}
                  onClick={() => !on && onChooseSex(sex)}
                  className={`min-h-11 cursor-pointer rounded-[10px] border-2 text-[15px] ${desktop ? 'px-5' : 'px-3.5'} ${on ? 'border-action bg-surface font-extrabold text-ink' : 'border-transparent bg-transparent font-bold text-action'}`}
                >
                  {sex === 'female' ? GROWTH.girls : GROWTH.boys}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className={`leading-[1.45] text-body ${desktop ? 'max-w-[220px] flex-none text-[15px]' : 'text-[14px]'}`}>
          {GROWTH.tableChosenBy(chart.referenceSex, ownerName)}
        </p>
      )
    ) : null

  const beyond = curveSet && points.some((p) => p.months > curveSet.maxMonths) ? (indicator === 'weight' ? GROWTH.beyondWeight : GROWTH.beyondHeight) : null
  const notes = (
    <>
      {referenceOff ? <p className="text-[14px] leading-[1.45] text-body">{GROWTH.referenceOff}</p> : null}
      {beyond ? <p className="text-[14px] leading-[1.45] text-body">{beyond}</p> : null}
      {chooseFailed ? (
        <p role="alert" className="text-[14px] text-body">
          {GROWTH.tableFailed}
        </p>
      ) : null}
    </>
  )

  const drawing = (
    <div id="growth-tabpanel" role="tabpanel" aria-labelledby={`growth-tab-${indicator}`} className={desktop ? '' : '-mx-0.5'}>
      <GrowthChart
        desktop={desktop}
        indicator={indicator}
        points={points}
        curves={curves}
        xMax={xMax}
        y={y}
        selected={selected}
        onPick={choose}
        name={GROWTH.chartName(indicator, childName)}
      />
    </div>
  )

  return (
    <section aria-label={GROWTH.chartSection} className={`${growthCard} flex flex-col ${desktop ? 'gap-4 p-6' : 'gap-3 p-4'}`}>
      {desktop ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {tabList}
          {rangeGroup}
        </div>
      ) : (
        <>
          {tabList}
          {rangeGroup}
        </>
      )}
      {invite}
      {reading}
      {drawing}
      {notes}
      {desktop ? (
        <div className="flex items-center gap-5">
          {referenceOff ? null : <WhoNote desktop className="min-w-0 flex-1" />}
          {sexPick}
        </div>
      ) : (
        <>
          {sexPick}
          {referenceOff ? null : <WhoNote desktop={false} />}
        </>
      )}
    </section>
  )
}

