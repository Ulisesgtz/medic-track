import { useCallback, useRef, useState } from 'react'
import { formatDayMonth } from '../../shared/date'
import { DoseChip } from './DoseChip'
import { dayKey } from './treatmentDays'
import { ProgressBar } from './ProgressBar'
import { groupByPeriod } from './dayPeriods'
import { EndTreatmentDialog } from './EndTreatmentDialog'
import { useEndTreatment } from './useEndTreatment'
import { medicationProgress } from './progress'
import type { Medication } from './types'

function schedule({ frequencyHours, durationDays, startTime }: Medication): string {
  const every = frequencyHours === 1 ? 'Cada hora' : `Cada ${frequencyHours} horas`
  const days = durationDays === 1 ? '1 día' : `${durationDays} días`
  return [every, days, startTime ? `primera toma ${startTime}` : null].filter(Boolean).join(' · ')
}

interface MedicationCardProps {
  consultationId: string
  medication: Medication
  variant: 'phone' | 'desktop'
}

/**
 * A medication with its schedule line and the chips of one day of doses, grouped by moment of the day (specs/015).
 * The mockups show a single row of chips: it is today's when the medication has doses today, otherwise the nearest day
 * with doses. The other days are reached through the treatment calendar (specs/019), which lists any day's doses.
 */
export function MedicationCard({ consultationId, medication, variant }: MedicationCardProps) {
  const [now] = useState(() => Date.now())
  const days = [...new Set(medication.doses.map((d) => dayKey(d.scheduledAt)))].sort()
  const todayKey = dayKey(new Date(now).toISOString())
  const shownDay = days.find((d) => d >= todayKey) ?? days[days.length - 1]
  const chips = medication.doses.filter((d) => dayKey(d.scheduledAt) === shownDay)

  // specs/016: ending the treatment early. Offered while it runs and has doses still ahead; afterwards the card says
  // when it ended and how many of the doses that corresponded were marked.
  const [confirming, setConfirming] = useState(false)
  const endButton = useRef<HTMLButtonElement>(null)
  const endMutation = useEndTreatment(consultationId, medication.id)
  const closeConfirm = useCallback(() => setConfirming(false), [setConfirming])
  const canEnd = !medication.endedAt && medication.doses.some((d) => d.status === 'pending')
  const progress = medicationProgress(medication.doses)

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
      <ProgressBar doses={medication.doses} />

      {/* specs/015: the day's doses by moment of the day (Mañana, Tarde, Noche); empty moments don't show. */}
      {groupByPeriod(chips).map((group) => (
        <div key={group.key} role="group" aria-label={`${group.label}, ${medication.name}`} className="mt-4">
          <p aria-hidden="true" className="text-xs font-extrabold tracking-[0.1em] text-ink-soft uppercase">
            {group.label}
          </p>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {group.doses.map((dose) => (
              <DoseChip key={dose.id} consultationId={consultationId} dose={dose} />
            ))}
          </div>
        </div>
      ))}

      {medication.endedAt ? (
        <p className="mt-4 text-[13px] font-bold text-ink-soft">
          Terminado el {formatDayMonth(medication.endedAt)} · {progress.taken} de {progress.total}{' '}
          {progress.total === 1 ? 'toma' : 'tomas'}
        </p>
      ) : (
        canEnd && (
          <button
            ref={endButton}
            type="button"
            onClick={() => {
              endMutation.reset()
              setConfirming(true)
            }}
            className="mt-4 min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Finalizar tratamiento
          </button>
        )
      )}
      {confirming && (
        <EndTreatmentDialog
          medicationName={medication.name}
          busy={endMutation.isPending}
          error={endMutation.isError ? 'No pudimos finalizar el tratamiento. Inténtalo de nuevo.' : null}
          onConfirm={() => endMutation.mutate(undefined, { onSuccess: closeConfirm })}
          onCancel={closeConfirm}
          opener={endButton}
        />
      )}
    </article>
  )
}
