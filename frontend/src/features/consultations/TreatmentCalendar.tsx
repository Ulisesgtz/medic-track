import { useId, useState } from 'react'
import { LONG_MONTHS } from '../../shared/date'
import { DayDoses } from './DayDoses'
import {
  initialDay,
  longDay,
  marksOn,
  medBg,
  medText,
  monthGrid,
  monthOfDay,
  monthsOf,
  numbered,
  treatmentSpan,
  type Month,
} from './treatmentDays'
import type { Medication } from './types'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface TreatmentCalendarProps {
  consultationId: string
  medications: Medication[]
  /** The parent's local today, `YYYY-MM-DD`. */
  today: string
  variant: 'phone' | 'desktop'
  /** Spacing around the block: here, so a consultation with nothing to show leaves no empty gap behind. */
  className?: string
}

/**
 * One calendar for the whole consultation (specs/019): every day of each medication's range carries its number in its
 * color (color is never the only indicator), a legend names them, and tapping a day lists its doses below, markable.
 * It only presents what the detail already has — no range, dose or status changes here. Arrows stop at the first and
 * the last month with treatment, so there is never an empty month to page through. Phone and web are two designs
 * (`variant`): the same pieces with their own sizes.
 */
export function TreatmentCalendar({ consultationId, medications, today, variant, className }: TreatmentCalendarProps) {
  const meds = numbered(medications)
  const span = treatmentSpan(meds)
  const [selected, setSelected] = useState<string | null>(() => initialDay(meds, today))
  const [view, setView] = useState<Month | null>(() => (selected ? monthOfDay(selected) : null))
  const headingId = useId()
  if (!span || !selected || !view) return null

  const months = monthsOf(span)
  const found = months.findIndex((m) => m.year === view.year && m.month === view.month)
  const index = found === -1 ? 0 : found
  const current = months[index]
  const desktop = variant === 'desktop'

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft">
        Calendario del tratamiento
      </h2>
      <div
        className={`mt-3.5 rounded-3xl bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${desktop ? 'p-6' : 'p-4'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Mes anterior"
            disabled={index === 0}
            onClick={() => setView(months[index - 1])}
            className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-xl font-black text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-default disabled:opacity-40"
          >
            ‹
          </button>
          <p aria-live="polite" className="text-base font-extrabold text-ink">
            {LONG_MONTHS[current.month]} {current.year}
          </p>
          <button
            type="button"
            aria-label="Mes siguiente"
            disabled={index === months.length - 1}
            onClick={() => setView(months[index + 1])}
            className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-xl font-black text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-default disabled:opacity-40"
          >
            ›
          </button>
        </div>

        <div aria-hidden="true" className="mt-2 grid grid-cols-7 text-center text-[13px] font-bold text-slate-600">
          {WEEKDAYS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="mt-1 flex flex-col gap-1">
          {monthGrid(current).map((week) => (
            <div key={week[0].key} className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                if (!day.inMonth) return <span key={day.key} />
                const marks = marksOn(day.key, meds)
                const isSelected = day.key === selected
                const isToday = day.key === today
                const name = marks.length
                  ? `${longDay(day.key)} · ${marks.map((n) => `${n} ${meds[n - 1].medication.name}`).join(', ')}`
                  : longDay(day.key)
                return (
                  <button
                    key={day.key}
                    type="button"
                    aria-label={name}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => setSelected(day.key)}
                    className={`flex cursor-pointer flex-col items-center rounded-xl py-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${
                      desktop ? 'min-h-16' : 'min-h-[52px]'
                    } ${marks.length ? 'bg-hint' : ''} ${isSelected ? 'ring-2 ring-ink' : 'hover:bg-hint'}`}
                  >
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-extrabold ${
                        isToday ? 'bg-ink text-white' : marks.length ? 'text-ink' : 'text-slate-600'
                      }`}
                    >
                      {day.day}
                    </span>
                    {marks.length > 0 && (
                      <span aria-hidden="true" className="mt-0.5 flex flex-wrap justify-center gap-x-1 px-0.5 text-[13px] leading-[1.1] font-black">
                        {marks.map((n) => (
                          <span key={n} className={medText(n)}>
                            {n}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Medicamentos del calendario">
          {meds.map(({ number, medication }) => (
            <li key={medication.id} className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ${medBg(number)}`}
              >
                {number}
              </span>
              <span className="min-w-0 truncate">{medication.name}</span>
            </li>
          ))}
        </ul>

        <DayDoses consultationId={consultationId} medications={medications} day={selected} today={today} />
      </div>
    </section>
  )
}
