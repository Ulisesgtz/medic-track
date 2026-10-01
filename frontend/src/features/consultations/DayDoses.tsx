import { formatTime } from '../../shared/date'
import { DoseChip } from './DoseChip'
import { dosesOn, longDay, medBg, nextDose } from './treatmentDays'
import type { Medication } from './types'

interface DayDosesProps {
  consultationId: string
  medications: Medication[]
  /** The selected day, `YYYY-MM-DD`. */
  day: string
  today: string
  variant: 'phone' | 'desktop'
}

/**
 * The doses of the day picked in the calendar, in the look of the design of specs/022: of every medication and by time,
 * each with the color and number of its medication and the design's chip (a fixed width; green "dada", amber "por
 * marcar", dashed "sin registrar" or the next one "próxima"). The chip is the same button as the medication's own card
 * — marking it here or there is the same thing — and is named after its medication ("Amoxicilina, 08:00") so
 * "Toma de 08:00" stays unique on the screen.
 */
export function DayDoses({ consultationId, medications, day, today, variant }: DayDosesProps) {
  const doses = dosesOn(day, medications)
  const nextId = nextDose(medications)
  const desktop = variant === 'desktop'
  return (
    <div className="flex flex-col gap-3.5">
      <h3 className={`font-black text-ink ${desktop ? 'text-base' : 'text-lg'}`}>{day === today ? 'Tomas de hoy' : `Tomas del ${longDay(day)}`}</h3>
      {doses.length === 0 ? (
        <p className="text-sm font-semibold text-slate-600">Ese día no hay tomas.</p>
      ) : (
        <ul aria-label="Tomas del día" className="flex flex-col gap-2.5">
          {doses.map(({ number, medication, dose }) => (
            <li key={dose.id} className={`flex items-center ${desktop ? 'gap-3' : 'gap-2.5'}`}>
              <span
                aria-hidden="true"
                className={`flex shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ${medBg(number)} ${
                  desktop ? 'h-6 w-6' : 'h-[26px] w-[26px]'
                }`}
              >
                {number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-[#1e293b]">{medication.name}</span>
              <DoseChip
                consultationId={consultationId}
                dose={dose}
                label={`${medication.name}, ${formatTime(dose.scheduledAt)}`}
                appearance="calendar"
                desktop={desktop}
                next={dose.id === nextId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
