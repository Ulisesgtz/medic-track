import { formatTime } from '../../shared/date'
import { DoseChip } from './DoseChip'
import { dosesOn, longDay, medBg } from './treatmentDays'
import type { Medication } from './types'

interface DayDosesProps {
  consultationId: string
  medications: Medication[]
  /** The selected day, `YYYY-MM-DD`. */
  day: string
  today: string
}

/**
 * The doses of the day picked in the calendar (specs/019), of every medication and by time, each with the mark of its
 * medication and the same chip as the medication's own card: marking it here or there is the same thing. The chip is
 * named after its medication ("Amoxicilina, 08:00") so "Toma de 08:00" stays unique on the screen.
 */
export function DayDoses({ consultationId, medications, day, today }: DayDosesProps) {
  const doses = dosesOn(day, medications)
  return (
    <div className="mt-5 border-t border-hint-border pt-4">
      <h3 className="text-[15px] font-extrabold text-ink">{day === today ? 'Tomas de hoy' : `Tomas del ${longDay(day)}`}</h3>
      {doses.length === 0 ? (
        <p className="mt-2 text-sm font-semibold text-slate-600">Ese día no hay tomas.</p>
      ) : (
        <ul aria-label="Tomas del día" className="mt-3 flex flex-col gap-2.5">
          {doses.map(({ number, medication, dose }) => (
            <li key={dose.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ${medBg(number)}`}
              >
                {number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{medication.name}</span>
              <DoseChip
                consultationId={consultationId}
                dose={dose}
                label={`${medication.name}, ${formatTime(dose.scheduledAt)}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
