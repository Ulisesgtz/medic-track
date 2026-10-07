import { LONG_MONTHS } from '../../shared/date'
import { dayKey, monthGrid, type Month } from '../consultations/treatmentDays'
import type { RoutineDose } from './types'

const WEEKDAY_HEADS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface RoutineCalendarProps {
  month: Month
  doses: RoutineDose[]
  /** The chosen day, "YYYY-MM-DD". */
  selected: string
  onSelect: (day: string) => void
  onMonth: (delta: -1 | 1) => void
  canPrev: boolean
  canNext: boolean
}

const dotsOf = (doses: RoutineDose[]) => doses.map((d) => d.taken)

/**
 * The month of one routine (mock RutinaDetalle): a day with doses is a pale pill with ONE DOT PER DOSE — filled when that dose
 * was marked, a ring when not — in the action color (a routine is a single "medication", so it doesn't use the colors of the
 * consultation's calendar). The chosen day is the dark cell, with cyan dots. Days without doses are plain numbers. Records only
 * what was marked; nothing is evaluated.
 */
export function RoutineCalendar({ month, doses, selected, onSelect, onMonth, canPrev, canNext }: RoutineCalendarProps) {
  const byDay = new Map<string, RoutineDose[]>()
  for (const d of doses) {
    const key = dayKey(d.scheduledAt)
    byDay.set(key, [...(byDay.get(key) ?? []), d])
  }
  const monthName = LONG_MONTHS[month.month]

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={!canPrev}
          onClick={() => onMonth(-1)}
          className="h-11 w-11 cursor-pointer rounded-xl border border-hint-edge bg-hint text-xl font-extrabold text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹
        </button>
        <span className="text-lg font-black text-ink">
          {monthName} {month.year}
        </span>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={!canNext}
          onClick={() => onMonth(1)}
          className="h-11 w-11 cursor-pointer rounded-xl border border-hint-edge bg-hint text-xl font-extrabold text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed disabled:opacity-40"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-[3px]">
        {WEEKDAY_HEADS.map((w, i) => (
          <span key={i} aria-hidden="true" className="pb-1 text-center text-[13px] font-extrabold text-calendar-muted">
            {w}
          </span>
        ))}
        {monthGrid(month)
          .flat()
          .map((cell) => {
            const dayDoses = cell.inMonth ? (byDay.get(cell.key) ?? []) : []
            const isSel = cell.inMonth && cell.key === selected
            if (!cell.inMonth) {
              return <div key={cell.key} className="h-[54px]" />
            }
            if (dayDoses.length === 0 && !isSel) {
              return (
                <div key={cell.key} className="flex h-[54px] justify-center pt-2 text-[15px] font-bold text-calendar-muted">
                  {cell.day}
                </div>
              )
            }
            const dots = dotsOf(dayDoses)
            const marked = dots.filter(Boolean).length
            const label =
              dots.length === 0
                ? `${cell.day} de ${monthName}: sin tomas`
                : `${cell.day} de ${monthName}: ${marked} de ${dots.length} ${dots.length === 1 ? 'toma marcada' : 'tomas marcadas'}`
            return (
              <div key={cell.key} className="h-[54px]">
                <button
                  type="button"
                  aria-pressed={isSel}
                  aria-label={label}
                  onClick={() => onSelect(cell.key)}
                  className={`flex h-full w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl pt-[7px] focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 ${
                    isSel ? 'bg-ink ring-2 ring-bright' : 'border border-hint-edge bg-hint hover:bg-hint-edge'
                  }`}
                >
                  <span className={`text-[15px] ${isSel ? 'font-black text-white' : 'font-extrabold text-ink'}`}>{cell.day}</span>
                  <span className="flex gap-[3px]">
                    {dots.map((done, i) =>
                      done ? (
                        <span key={i} className={`h-[7px] w-[7px] rounded-full ${isSel ? 'bg-bright' : 'bg-action'}`} />
                      ) : (
                        <span key={i} className={`box-border h-[7px] w-[7px] rounded-full border-2 ${isSel ? 'border-hint-border' : 'border-action'}`} />
                      ),
                    )}
                  </span>
                </button>
              </div>
            )
          })}
      </div>

      <div className="flex flex-wrap gap-x-[18px] gap-y-2 px-1.5 text-[13px] font-semibold text-calendar-text">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full bg-action" />
          Marcada
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="box-border h-[9px] w-[9px] rounded-full border-2 border-action" />
          Sin marcar
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-4 rounded border border-hint-edge bg-hint" />
          Día con tomas
        </span>
      </div>
    </div>
  )
}
