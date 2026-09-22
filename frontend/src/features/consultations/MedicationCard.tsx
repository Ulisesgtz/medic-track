import { useState } from 'react'
import { formatDayMonth, formatTime } from '../../shared/date'
import { useDoseToggle } from './useDoseToggle'
import type { Dose, Medication } from './types'

const dayKey = (instant: string) => {
  const d = new Date(instant)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * One dose as a time chip (mockups 03/13): "08:00 ✓" taken (green), amber when
 * its time passed without being marked, grey while it hasn't come yet. Always
 * enabled — the parent can correct a dose of any time. A toggle: fixed name
 * ("Toma de 08:00"), the state only in aria-pressed.
 */
function DoseChip({ consultationId, dose, now }: { consultationId: string; dose: Dose; now: number }) {
  const mutation = useDoseToggle(consultationId, dose.id)
  const time = formatTime(dose.scheduledAt)
  const isFuture = new Date(dose.scheduledAt).getTime() > now
  const style = dose.taken
    ? 'bg-confirmed text-white'
    : isFuture
      ? 'bg-slate-100 text-slate-600'
      : 'border-[1.5px] border-pending bg-pending-soft text-[#92400e]'

  return (
    <button
      type="button"
      aria-pressed={dose.taken}
      aria-label={`Toma de ${time}`}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!dose.taken)}
      className={`min-h-11 min-w-[76px] flex-1 cursor-pointer rounded-xl py-3 text-sm font-extrabold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${style}`}
    >
      {time}
      {dose.taken ? ' ✓' : ''}
    </button>
  )
}

function schedule({ frequencyHours, durationDays, startTime }: Medication): string {
  const every = frequencyHours === 1 ? 'Cada hora' : `Cada ${frequencyHours} horas`
  const days = durationDays === 1 ? '1 día' : `${durationDays} días`
  return [every, days, startTime ? `desde ${startTime}` : null].filter(Boolean).join(' · ')
}

interface MedicationCardProps {
  consultationId: string
  medication: Medication
  variant: 'phone' | 'desktop'
}

/**
 * A medication with its schedule line and the chips of one day of doses.
 * The mockups show a single row of chips: it is today's when the medication
 * has doses today, otherwise the nearest day with doses; a small day switcher
 * appears only when the treatment spans several days, so every dose stays
 * reachable.
 */
export function MedicationCard({ consultationId, medication, variant }: MedicationCardProps) {
  const [now] = useState(() => Date.now())
  const days = [...new Set(medication.doses.map((d) => dayKey(d.scheduledAt)))].sort()
  const todayKey = dayKey(new Date(now).toISOString())
  const [selected, setSelected] = useState<string | undefined>(
    () => days.find((d) => d >= todayKey) ?? days[days.length - 1],
  )
  const index = selected ? days.indexOf(selected) : -1
  const chips = medication.doses.filter((d) => dayKey(d.scheduledAt) === selected)
  const dayLabel = selected === todayKey ? 'Hoy' : chips[0] ? formatDayMonth(chips[0].scheduledAt) : ''

  return (
    <article
      className={`min-w-0 rounded-3xl bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${
        variant === 'desktop' ? 'p-6' : 'p-5'
      }`}
    >
      <h3 className={`font-black tracking-tight text-ink ${variant === 'desktop' ? 'text-xl' : 'text-lg'}`}>
        {medication.name}
      </h3>
      <p className="mt-1 text-sm font-semibold text-action">{schedule(medication)}</p>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {chips.map((dose) => (
            <DoseChip key={dose.id} consultationId={consultationId} dose={dose} now={now} />
          ))}
        </div>
      )}

      {days.length > 1 && (
        <div className="mt-3 flex items-center justify-between text-[13px] font-bold text-action">
          <button
            type="button"
            disabled={index <= 0}
            onClick={() => setSelected(days[index - 1])}
            className="-my-3 min-h-11 cursor-pointer pr-3 disabled:cursor-default disabled:opacity-40"
          >
            ← Día anterior
          </button>
          <span className="text-slate-500">{dayLabel}</span>
          <button
            type="button"
            disabled={index >= days.length - 1}
            onClick={() => setSelected(days[index + 1])}
            className="-my-3 min-h-11 cursor-pointer pl-3 disabled:cursor-default disabled:opacity-40"
          >
            Día siguiente →
          </button>
        </div>
      )}
    </article>
  )
}
