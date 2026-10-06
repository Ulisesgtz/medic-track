import { useCallback, useRef, useState } from 'react'
import { formatDayMonth } from '../../shared/date'
import { DoseChip } from './DoseChip'
import { dosesOfDay, longDay } from './treatmentDays'
import { ProgressBar } from './ProgressBar'
import { groupByPeriod } from './dayPeriods'
import { EndTreatmentDialog } from './EndTreatmentDialog'
import { ExtendTreatmentDialog } from './ExtendTreatmentDialog'
import { ConsultationApiError } from './api'
import { useEndTreatment } from './useEndTreatment'
import { useExtendTreatment } from './useExtendTreatment'
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
  /** The day the treatment calendar has chosen (`YYYY-MM-DD`), or null when there are no doses to show at all. */
  day: string | null
  /** The parent's local today, `YYYY-MM-DD`. */
  today: string
  /**
   * Whether the session can end or extend the treatment (specs/032: only who can do everything in the family; a Caregiver
   * only marks doses). The server enforces it; this keeps the buttons from being offered. Absent = yes.
   */
  canManage?: boolean
}

/**
 * A medication with its schedule line and the chips of the day chosen in the treatment calendar (specs/023), grouped by
 * moment of the day (specs/015). Progress and the end/extend state always count the whole medication.
 */
export function MedicationCard({ consultationId, medication, variant, day, today, canManage = true }: MedicationCardProps) {
  const chips = day ? dosesOfDay(medication, day) : []

  // specs/016: ending the treatment early. Offered while it runs and has doses still ahead; afterwards the card says
  // when it ended and how many of the doses that corresponded were marked.
  const [confirming, setConfirming] = useState(false)
  const endButton = useRef<HTMLButtonElement>(null)
  const endMutation = useEndTreatment(consultationId, medication.id)
  const closeConfirm = useCallback(() => setConfirming(false), [setConfirming])
  const canEnd = canManage && !medication.endedAt && medication.doses.some((d) => d.status === 'pending')

  // specs/020: adding doses to the end, only when the parent decides (their doctor said so). Offered while there are
  // unregistered doses not covered yet; the card says afterwards that it was done.
  const [extending, setExtending] = useState(false)
  const extendButton = useRef<HTMLButtonElement>(null)
  const extendMutation = useExtendTreatment(consultationId, medication.id)
  const closeExtend = useCallback(() => setExtending(false), [setExtending])
  // A backend that predates spec 020 (both versions are deployed for a while) sends neither field: nothing to offer.
  const extendable = medication.extendableDoses ?? 0
  const extensions = medication.extensions ?? []
  const canExtend = canManage && !medication.endedAt && extendable > 0
  const lastExtension = extensions[extensions.length - 1]
  // Another device extended it while the dialog was open: nothing is left to cover, so the dialog closes for good —
  // otherwise it would pop up again the day new doses turn unregistered.
  if (extending && !canExtend) setExtending(false)
  const progress = medicationProgress(medication.doses)

  return (
    <article
      data-medication-card
      className={`min-w-0 rounded-3xl bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${
        variant === 'desktop' ? 'p-6' : 'p-5'
      }`}
    >
      <h3 className={`font-black tracking-tight text-ink ${variant === 'desktop' ? 'text-xl' : 'text-lg'}`}>
        {medication.name}
      </h3>
      <p className="mt-1 text-sm font-semibold text-action">{schedule(medication)}</p>
      <ProgressBar doses={medication.doses} />

      {day && (
        <p className="mt-4 text-xs font-extrabold tracking-[0.1em] text-ink-soft uppercase">
          {day === today ? 'Tomas de hoy' : `Tomas del ${longDay(day)}`}
        </p>
      )}
      {day && chips.length === 0 && <p className="mt-2 text-sm font-semibold text-slate-600">Este día no tiene tomas.</p>}
      {/* specs/015: the day's doses by moment of the day (Mañana, Tarde, Noche); empty moments don't show. */}
      {groupByPeriod(chips).map((group) => (
        <div key={group.key} role="group" aria-label={`${group.label}, ${medication.name}, ${day === today ? 'hoy' : longDay(day!)}`} className="mt-3">
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

      {lastExtension && (
        <p className="mt-4 text-[13px] font-bold text-ink-soft">
          Se recorrió el {formatDayMonth(lastExtension.createdAt)} · +{lastExtension.addedDoses}{' '}
          {lastExtension.addedDoses === 1 ? 'toma' : 'tomas'}
          {lastExtension.manual ? ' · número ingresado manualmente' : ''}
        </p>
      )}

      {medication.endedAt ? (
        <p className="mt-4 text-[13px] font-bold text-ink-soft">
          Terminado el {formatDayMonth(medication.endedAt)} · {progress.taken} de {progress.total}{' '}
          {progress.total === 1 ? 'toma' : 'tomas'}
        </p>
      ) : (
        (canEnd || canExtend) && (
          <div className="mt-4 flex flex-wrap gap-3">
            {canExtend && (
              <button
                ref={extendButton}
                type="button"
                onClick={() => {
                  extendMutation.reset()
                  setExtending(true)
                }}
                className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              >
                Recorrer tratamiento
              </button>
            )}
            {canEnd && (
              <button
                ref={endButton}
                type="button"
                onClick={() => {
                  endMutation.reset()
                  setConfirming(true)
                }}
                className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              >
                Finalizar tratamiento
              </button>
            )}
          </div>
        )
      )}
      {extending && (
        <ExtendTreatmentDialog
          medicationName={medication.name}
          frequencyHours={medication.frequencyHours}
          lastDoseAt={medication.doses[medication.doses.length - 1].scheduledAt}
          proposed={extendable}
          busy={extendMutation.isPending}
          error={
            extendMutation.isError && !(extendMutation.error instanceof ConsultationApiError && extendMutation.error.kind === 'nothing_to_extend')
              ? 'No pudimos recorrer el tratamiento. Inténtalo de nuevo.'
              : null
          }
          onConfirm={(doses) =>
            extendMutation.mutate(doses, {
              onSuccess: closeExtend,
              // Already done (another tap or device): the detail refreshes and the button goes away.
              onError: (e) => e instanceof ConsultationApiError && e.kind === 'nothing_to_extend' && closeExtend(),
            })
          }
          onCancel={closeExtend}
          opener={extendButton}
        />
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
