import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { GrowthChart } from './GrowthChart'
import { WhoNote, growthCard } from './GrowthCards'
import {
  axisValues,
  rangeLabel,
  rangePlan,
  visibleCurves,
  visiblePoints,
  yAxis,
  type RangeKind,
} from './chartModel'
import { ageAt } from './growthAge'
import { GROWTH, readingLine, readingMeta, valueText } from './growthText'
import type { GrowthChart as Chart, Indicator, ReferenceSex } from './types'

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
  const [range, setRange] = useState<RangeKind | null>(null)
  // The chosen measurement by its date and its place among that day's (two can share a date).
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const reference = chart.reference
  const referenceOff = reference != null && !reference.available
  const noSex = chart.referenceSex == null
  const curveSet = reference?.available && !noSex ? reference[indicator] : null
  // The axis ends where the WHO curve does (the server's `limits`, also before a table is chosen): the points are already only the
  // ones that curve covers (spec 076).
  const limit = chart.limits[indicator]
  const refMax = referenceOff ? null : limit.maxMonths

  const allPoints = [...chart.points[indicator]].sort((a, b) => a.months - b.months)
  const plan = rangePlan(chart.birthDate, today, refMax, allPoints)
  const fullIsReference = refMax != null && plan.full === refMax
  const chosenRange: RangeKind = range === 'short' && plan.short != null ? 'short' : range === 'full' ? 'full' : plan.initial
  const xMax = chosenRange === 'short' && plan.short != null ? plan.short : plan.full
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
    ...(plan.short != null ? [{ kind: 'short' as const, label: rangeLabel('short', plan.short, fullIsReference) }] : []),
    ...(plan.full > (plan.short ?? 0) ? [{ kind: 'full' as const, label: rangeLabel('full', plan.full, fullIsReference) }] : []),
  ]

  // «Ir a Medidas anotadas ↓»: jumps to the list or the table (a real link, but the router's address is left alone).
  const goToList = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const target = document.getElementById('medidas')
    target?.scrollIntoView({ block: 'start' })
    target?.focus({ preventScroll: true })
  }

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
        const on = chosenRange === r.kind
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
        className={`flex size-11 flex-none cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-hint-border bg-surface text-[22px] font-extrabold text-action disabled:cursor-not-allowed ${disabled ? 'opacity-40' : ''}`}
      >
        {dir === 'prev' ? '‹' : '›'}
      </button>
    )
  }

  const counter =
    limit.later > 0 && selected != null ? (
      <span className="text-[13px] leading-[normal] font-semibold text-muted">{GROWTH.readingCount(selected + 1, points.length, indicator)}</span>
    ) : null
  const reading =
    point == null ? (
      <p className={`text-body ${desktop ? 'text-[16px]' : 'text-[15px]'}`}>{GROWTH.noPoints(indicator)}</p>
    ) : desktop ? (
      <div aria-live="polite" className="flex items-center gap-3">
        {arrow('prev')}
        <span className="flex flex-col gap-px">
          <span className="text-[18px] font-extrabold text-ink tabular-nums">{readingLine(point.measuredOn, indicator, point.value, age)}</span>
          {counter}
        </span>
        {arrow('next')}
      </div>
    ) : (
      <div aria-live="polite" className="flex items-center gap-2 rounded-[14px] border border-hint-edge bg-canvas p-1.5">
        {arrow('prev')}
        <div className="flex min-w-0 flex-1 flex-col gap-px text-center">
          <span className="text-[18px] leading-[normal] font-black text-ink tabular-nums">{valueText(indicator, point.value)}</span>
          <span className="text-[14px] leading-[normal] font-medium text-body">{readingMeta(point.measuredOn, age)}</span>
          {counter}
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
          <span className="text-[14px] leading-[normal] font-bold text-body">{GROWTH.tablePick}</span>
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

  // The fixed sentence of the mock: only in the tab whose curve ends before some of the child's measurements.
  const limitNote = limit.later > 0 && allPoints.length > 0 ? GROWTH.limitNote(indicator, limit.maxMonths / 12) : null
  const notes = (
    <>
      {referenceOff ? <p className="text-[14px] leading-[1.45] text-body">{GROWTH.referenceOff}</p> : null}
      {referenceOff && limitNote ? <p className="text-[14px] leading-[1.45] text-body">{limitNote}</p> : null}
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

  const none = (text: string) => (
    <div className={`flex flex-col gap-1.5 rounded-[14px] border border-hint-border bg-hint ${desktop ? 'px-5 py-[18px]' : 'p-4'}`}>
      <p className={`leading-normal font-semibold text-ink ${desktop ? 'text-[17px]' : 'text-[16px]'}`}>{text}</p>
      <a href="#medidas" onClick={goToList} className="inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:text-ink hover:underline">
        {GROWTH.goToList}
      </a>
    </div>
  )
  const cardClass = `${growthCard} flex flex-col ${desktop ? 'gap-4 p-6' : 'gap-3 p-4'}`

  // C: no tab has anything the curves cover, but something was written after them: no tabs, no axes, one sentence.
  const laterTotal = chart.limits.weight.later + chart.limits.height.later
  if (chart.points.weight.length === 0 && chart.points.height.length === 0 && laterTotal > 0) {
    return (
      <section aria-label={GROWTH.chartSection} className={cardClass}>
        <h2 className={`leading-[normal] font-extrabold text-ink ${desktop ? 'text-[20px]' : 'text-[18px]'}`}>{GROWTH.chartSection}</h2>
        {none(GROWTH.noChartAny(chart.limits.weight.maxMonths / 12, chart.limits.height.maxMonths / 12))}
      </section>
    )
  }
  // B: this tab's curve ended before every measurement of it: the tabs stay, the rest of the card is one sentence.
  if (allPoints.length === 0 && limit.later > 0) {
    return (
      <section aria-label={GROWTH.chartSection} className={cardClass}>
        {tabList}
        <div id="growth-tabpanel" role="tabpanel" aria-labelledby={`growth-tab-${indicator}`}>
          {none(GROWTH.noChartTab(indicator, limit.maxMonths / 12, childName))}
        </div>
      </section>
    )
  }

  return (
    <section aria-label={GROWTH.chartSection} className={cardClass}>
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
          {referenceOff ? null : <WhoNote desktop className="min-w-0 flex-1" limitNote={limitNote} />}
          {sexPick}
        </div>
      ) : (
        <>
          {sexPick}
          {referenceOff ? null : <WhoNote desktop={false} limitNote={limitNote} />}
        </>
      )}
    </section>
  )
}

