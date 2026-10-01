import { useId, useState } from 'react'
import { LONG_MONTHS } from '../../shared/date'
import {
  longDay,
  markLabel,
  marksOn,
  medBg,
  medBorder,
  monthGrid,
  monthOfDay,
  monthsOf,
  numbered,
  slotsOn,
  treatmentSpan,
  type DayMark,
  type Month,
} from './treatmentDays'
import type { Medication } from './types'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** The dot of one medication in a day: its color ring, filled when all the doses of that day were given (specs/022). */
function Dot({ mark, selected, desktop }: { mark: DayMark; selected: boolean; desktop: boolean }) {
  const size = desktop ? 'h-2 w-2' : 'h-[7px] w-[7px]'
  const color = selected
    ? mark.taken
      ? 'border-[#22d3ee] bg-[#22d3ee]'
      : 'border-[#a5f3fc] bg-transparent'
    : `${medBorder(mark.number)} ${mark.taken ? medBg(mark.number) : 'bg-transparent'}`
  return <span className={`box-border rounded-full border-2 ${size} ${color}`} />
}

interface TreatmentCalendarProps {
  medications: Medication[]
  /** The chosen day, `YYYY-MM-DD` (the page's: the medication cards show the doses of this same day, specs/023). */
  selected: string | null
  onSelect: (day: string) => void
  /** The parent's local today, `YYYY-MM-DD`. */
  today: string
  variant: 'phone' | 'desktop'
  /** Spacing around the block: here, so a consultation with nothing to show leaves no empty gap behind. */
  className?: string
}

/**
 * One calendar for the whole consultation, in the look of the design of specs/022: every day of the treatment is a pale
 * pill with one dot per medication that has doses that day — filled when they were all given, empty if not — the chosen
 * day is dark with a cyan ring, and below comes the legend. The chosen day belongs to the page (specs/023): tapping a day
 * calls `onSelect`, and the medication cards show that day's doses. Each dot keeps its own place
 * whether or not the other medications have doses, so its position says which medication it is: colors are never the
 * only way to know. It only presents what the detail already has (no range, dose or status changes here). Arrows stop at
 * the first and the last month with treatment. Phone and web are two designs (`variant`): the same pieces with their own
 * sizes.
 */
export function TreatmentCalendar({ medications, selected, onSelect, today, variant, className }: TreatmentCalendarProps) {
  const meds = numbered(medications)
  const span = treatmentSpan(meds)
  // The month on screen is the calendar's own: paging through months never changes the chosen day. Until the parent pages,
  // it follows the chosen day.
  const [paged, setView] = useState<Month | null>(null)
  const view = paged ?? (selected ? monthOfDay(selected) : null)
  const headingId = useId()
  if (!span || !selected || !view) return null

  const months = monthsOf(span)
  const found = months.findIndex((m) => m.year === view.year && m.month === view.month)
  const index = found === -1 ? 0 : found
  const current = months[index]
  const desktop = variant === 'desktop'
  // The arrow is drawn at the design's size (40 / 36 px) inside a 44 px touch area (negative margin keeps the layout).
  const arrowHit = `group ${desktop ? '-m-1' : '-m-0.5'} flex min-h-11 min-w-11 cursor-pointer items-center justify-center focus:outline-none disabled:cursor-default`
  const arrow = `flex items-center justify-center border border-[#cffafe] bg-[#ecfeff] font-extrabold text-action transition-colors duration-200 group-hover:bg-[#cffafe] group-focus-visible:ring-2 group-focus-visible:ring-action group-disabled:opacity-40 group-disabled:group-hover:bg-[#ecfeff] ${
    desktop ? 'h-9 w-9 rounded-[10px] text-lg' : 'h-10 w-10 rounded-xl text-xl'
  }`

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-ink">
        Calendario del tratamiento
      </h2>
      <div
        className={`mt-3.5 flex flex-col rounded-3xl bg-surface shadow-[0_8px_24px_rgba(4,37,43,0.06)] ${
          desktop ? 'gap-5 p-6' : 'gap-[18px] px-4 py-5'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Mes anterior" disabled={index === 0} onClick={() => setView(months[index - 1])} className={arrowHit}>
            <span className={arrow}>‹</span>
          </button>
          <p aria-live="polite" className={`font-black text-ink ${desktop ? 'text-lg' : 'text-xl'}`}>
            {LONG_MONTHS[current.month]} {current.year}
          </p>
          <button
            type="button"
            aria-label="Mes siguiente"
            disabled={index === months.length - 1}
            onClick={() => setView(months[index + 1])}
            className={arrowHit}
          >
            <span className={arrow}>›</span>
          </button>
        </div>

        <div className={`grid grid-cols-7 ${desktop ? 'gap-1.5' : 'gap-1'}`}>
          {WEEKDAYS.map((d, i) => (
            <div key={i} aria-hidden="true" className="pb-1 text-center text-[13px] font-extrabold text-[#64748b]">
              {d}
            </div>
          ))}
          {monthGrid(current)
            .flat()
            .map((day) => {
              const height = desktop ? 'min-h-[62px]' : 'min-h-[54px]'
              if (!day.inMonth) return <div key={day.key} className={height} />
              const slots = slotsOn(day.key, meds)
              const marks = marksOn(day.key, meds)
              const inTreatment = marks.length > 0
              const isSelected = day.key === selected
              const name = inTreatment
                ? `${longDay(day.key)} · ${marks.map((m) => markLabel(m, meds[m.number - 1].medication.name)).join(', ')}`
                : longDay(day.key)
              const number = desktop ? 'text-[15px]' : 'text-base'
              const pad = desktop ? 'gap-2 pt-[9px]' : 'gap-1.5 pt-[7px]'
              return (
                <button
                  key={day.key}
                  type="button"
                  aria-label={name}
                  aria-pressed={isSelected}
                  aria-current={day.key === today ? 'date' : undefined}
                  onClick={() => onSelect(day.key)}
                  className={`box-border flex cursor-pointer flex-col items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${height} ${
                    isSelected
                      ? `bg-ink ring-2 ring-[#22d3ee] ${pad}`
                      : inTreatment
                        ? `border border-[#cffafe] bg-[#ecfeff] transition-colors duration-200 hover:bg-[#cffafe] ${pad}`
                        : 'justify-start pt-2.5'
                  }`}
                >
                  <span
                    className={`${number} ${
                      isSelected ? 'font-black text-white' : inTreatment ? 'font-extrabold text-ink' : 'font-bold text-[#64748b]'
                    }`}
                  >
                    {day.day}
                  </span>
                  {inTreatment && (
                    <span
                      aria-hidden="true"
                      className={`grid justify-center ${desktop ? 'gap-1' : 'gap-[3px]'}`}
                      style={{ gridTemplateColumns: `repeat(${Math.min(3, slots.length)}, max-content)` }}
                    >
                      {slots.map((slot, i) =>
                        slot ? (
                          <Dot key={i} mark={slot} selected={isSelected} desktop={desktop} />
                        ) : (
                          <span key={i} className={desktop ? 'h-2 w-2' : 'h-[7px] w-[7px]'} />
                        ),
                      )}
                    </span>
                  )}
                </button>
              )
            })}
        </div>

        <ul
          aria-label="Medicamentos del calendario"
          className={desktop ? 'flex flex-wrap gap-x-[22px] gap-y-2.5' : 'flex flex-col gap-2.5'}
        >
          {meds.map(({ number, medication }) => (
            <li key={medication.id} className={`flex min-w-0 items-center text-[#1e293b] ${desktop ? 'gap-2' : 'gap-2.5'}`}>
              <span
                aria-hidden="true"
                className={`flex shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ${medBg(number)} ${
                  desktop ? 'h-[22px] w-[22px]' : 'h-[26px] w-[26px]'
                }`}
              >
                {number}
              </span>
              <span className={`min-w-0 truncate font-extrabold tracking-[0.02em] ${desktop ? 'text-[13px]' : 'text-sm'}`}>{medication.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
