import { useState } from 'react'
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
  shiftDay,
  shortDay,
  slotsOn,
  treatmentSpan,
  weekDays,
  weekStart,
  type DayMark,
  type Month,
  type NumberedMedication,
} from './treatmentDays'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** The dot of one medication in a day: its color ring, filled when all the doses of that day were given (specs/022). */
function Dot({ mark, selected, desktop }: { mark: DayMark; selected: boolean; desktop: boolean }) {
  const size = desktop ? 'h-2 w-2' : 'h-[7px] w-[7px]'
  const color = selected
    ? mark.taken
      ? 'border-bright bg-bright'
      : 'border-hint-border bg-transparent'
    : `${medBorder(mark.number)} ${mark.taken ? medBg(mark.number) : 'bg-transparent'}`
  return <span className={`box-border rounded-full border-2 ${size} ${color}`} />
}

interface TreatmentCalendarProps {
  meds: NumberedMedication[]
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
 * day is dark with a cyan ring and today has a thin ink ring. The chosen day belongs to the page (specs/023): tapping a day
 * calls `onSelect`, and the medication cards show that day's doses. Each dot keeps its own place whether or not the other
 * medications have doses, so its position says which medication it is: colors are never the only way to know. It only
 * presents what the detail already has. specs/056 (research R6): the phone shows one week and opens to the month with «Ver
 * mes»; the web always shows the month, with the legend in its heading row. Arrows never go past the treatment.
 */
export function TreatmentCalendar({ meds, selected, onSelect, today, variant, className }: TreatmentCalendarProps) {
  const span = treatmentSpan(meds)
  const desktop = variant === 'desktop'
  const [mode, setMode] = useState<'week' | 'month'>(desktop ? 'month' : 'week')
  // The month and the week on screen are the calendar's own: paging never changes the chosen day. Until the parent pages,
  // they follow the chosen day.
  const [paged, setView] = useState<Month | null>(null)
  const [pagedWeek, setWeek] = useState<string | null>(null)
  const view = paged ?? (selected ? monthOfDay(selected) : null)
  if (!span || !selected || !view) return null

  const week = !desktop && mode === 'week'
  const months = monthsOf(span)
  const found = months.findIndex((m) => m.year === view.year && m.month === view.month)
  const index = found === -1 ? 0 : found
  const current = months[index]
  const monday = pagedWeek ?? weekStart(selected)
  const sunday = shiftDay(monday, 6)
  const prev = week
    ? { label: 'Semana anterior', disabled: monday <= span.start, go: () => setWeek(shiftDay(monday, -7)) }
    : { label: 'Mes anterior', disabled: index === 0, go: () => setView(months[index - 1]) }
  const next = week
    ? { label: 'Semana siguiente', disabled: sunday >= span.end, go: () => setWeek(shiftDay(monday, 7)) }
    : { label: 'Mes siguiente', disabled: index === months.length - 1, go: () => setView(months[index + 1]) }
  const title = week ? `${shortDay(monday)} – ${shortDay(sunday)}` : `${LONG_MONTHS[current.month]} ${current.year}`
  const days = week ? weekDays(monday) : monthGrid(current).flat()

  // The arrow is drawn at the design's size (44 px on the phone, 36 px on the web) inside a 44 px touch area.
  const arrowHit = 'group flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center focus:outline-none disabled:cursor-default'
  const arrow = `flex items-center justify-center border border-hint-edge bg-hint font-extrabold text-action transition-colors duration-200 group-hover:bg-hint-edge group-focus-visible:ring-2 group-focus-visible:ring-action group-disabled:opacity-40 group-disabled:group-hover:bg-hint ${
    desktop ? 'h-9 w-9 rounded-[10px] text-lg' : 'h-11 w-11 rounded-xl text-xl'
  }`
  const arrowButton = (a: typeof prev, glyph: string) =>
    // A single month on the web needs no arrows (the design draws none).
    desktop && months.length === 1 ? null : (
      <button type="button" aria-label={a.label} disabled={a.disabled} onClick={a.go} className={arrowHit}>
        <span className={arrow}>{glyph}</span>
      </button>
    )
  const legend = (
    <ul aria-label="Medicamentos del calendario" className="flex flex-wrap gap-x-3.5 gap-y-1.5">
      {meds.map(({ number, medication }) => (
        <li key={medication.id} className="flex min-w-0 items-center gap-2 text-[14px] font-extrabold text-calendar-name">
          <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black text-white ${medBg(number)}`}>
            {number}
          </span>
          <span className="min-w-0 truncate">{medication.name}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <section
      aria-label="Calendario del tratamiento"
      className={`flex flex-col rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${desktop ? 'gap-3.5 px-[22px] py-5' : 'gap-2.5 px-3 pt-3.5 pb-3'} ${className ?? ''}`}
    >
      {desktop ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {arrowButton(prev, '‹')}
            <p aria-live="polite" className="text-[19px] font-black text-ink">
              {title}
            </p>
            {arrowButton(next, '›')}
          </div>
          {legend}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {arrowButton(prev, '‹')}
          <p aria-live="polite" className="flex-1 text-center text-[17px] font-black text-ink">
            {title}
          </p>
          {arrowButton(next, '›')}
        </div>
      )}

      <div className={`grid grid-cols-7 ${desktop ? 'gap-1.5' : 'gap-1'}`}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} aria-hidden="true" className="text-center text-[12px] font-extrabold text-calendar-muted">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const height = desktop ? 'h-[60px]' : 'h-14'
          if (!day.inMonth) return <div key={day.key} className={height} />
          const slots = slotsOn(day.key, meds)
          const marks = marksOn(day.key, meds)
          const inTreatment = marks.length > 0
          const isSelected = day.key === selected
          const name = inTreatment
            ? `${longDay(day.key)} · ${marks.map((m) => markLabel(m, meds[m.number - 1].medication.name)).join(', ')}`
            : longDay(day.key)
          // Today keeps a thin ink ring while another day is chosen: seen without relying on color (specs/027).
          const todayRing = day.key === today && !isSelected ? 'ring-[1.5px] ring-inset ring-ink' : ''
          const number = desktop ? 'text-[16px]' : 'text-[15px]'
          const pad = desktop ? 'gap-[7px] pt-2' : 'gap-1.5 pt-[7px]'
          return (
            <button
              key={day.key}
              type="button"
              aria-label={name}
              aria-pressed={isSelected}
              aria-current={day.key === today ? 'date' : undefined}
              onClick={() => onSelect(day.key)}
              className={`box-border flex cursor-pointer flex-col items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${height} ${todayRing} ${
                isSelected
                  ? `bg-ink ring-2 ring-bright ${pad}`
                  : inTreatment
                    ? `border border-hint-edge bg-hint transition-colors duration-200 hover:bg-hint-edge ${pad}`
                    : desktop
                      ? 'justify-start pt-[9px]'
                      : 'justify-start pt-2'
              }`}
            >
              <span className={`${number} ${isSelected ? 'font-black text-white' : inTreatment ? 'font-extrabold text-ink' : 'font-bold text-calendar-muted'}`}>
                {day.day}
              </span>
              {inTreatment && (
                <span
                  aria-hidden="true"
                  className={`grid justify-center ${desktop ? 'gap-1' : 'gap-[3px]'}`}
                  style={{ gridTemplateColumns: `repeat(${Math.min(3, slots.length)}, max-content)` }}
                >
                  {slots.map((slot, i) =>
                    slot ? <Dot key={i} mark={slot} selected={isSelected} desktop={desktop} /> : <span key={i} className={desktop ? 'h-2 w-2' : 'h-[7px] w-[7px]'} />,
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!desktop && (
        <button
          type="button"
          aria-expanded={mode === 'month'}
          onClick={() => {
            setMode(mode === 'week' ? 'month' : 'week')
            setView(null)
            setWeek(null)
          }}
          className="min-h-11 cursor-pointer self-center px-4 text-[14px] font-extrabold text-action"
        >
          {mode === 'week' ? 'Ver mes' : 'Ver semana'}
        </button>
      )}
    </section>
  )
}
