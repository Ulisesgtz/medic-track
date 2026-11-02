import { useCallback, useRef, useState } from 'react'
import { formatDayMonth } from '../../shared/date'
import { DETAIL, scheduleLine } from './consultationDetailText'
import { DoseRow } from './DoseRow'
import { dosesOfDay, longDay, medBg } from './treatmentDays'
import { ProgressBar } from './ProgressBar'
import { groupByPeriod } from './dayPeriods'
import { EndTreatmentDialog } from './EndTreatmentDialog'
import { ExtendTreatmentDialog } from './ExtendTreatmentDialog'
import { ConsultationApiError } from './api'
import { useEndTreatment } from './useEndTreatment'
import { useExtendTreatment } from './useExtendTreatment'
import { medicationProgress } from './progress'
import type { Medication } from './types'

interface MedicationCardProps {
  consultationId: string
  medication: Medication
  /** Its place in the consultation (1, 2…): the number and the color it carries in the calendar (specs/019). */
  number: number
  variant: 'phone' | 'desktop'
  /** The day the treatment calendar has chosen (`YYYY-MM-DD`), or null when there are no doses to show at all. */
  day: string | null
  /** The parent's local today, `YYYY-MM-DD`. */
  today: string
  /** A «solo registro» consultation (specs/024): no doses, bar or buttons — the medication and its schedule. */
  recordOnly?: boolean
  /**
   * Whether the session can end or extend the treatment (specs/032: only who can do everything in the family; a Caregiver
   * only marks doses). The server enforces it; this keeps the buttons from being offered. Absent = yes.
   */
  canManage?: boolean
}

const outline =
  'min-h-11 cursor-pointer rounded-[14px] border-2 border-action bg-transparent px-4 text-[14px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

/** A line of the medication's history (an extension, the end): grey, a ring for a bullet, never an alert. */
function HistoryLine({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-[14px] border border-hint-edge bg-canvas px-3 py-2.5 text-[14px] leading-[1.45] text-body">
      <span aria-hidden="true" className="mt-[5px] h-2 w-2 shrink-0 rounded-full border-2 border-calendar-muted" />
      <span>{children}</span>
    </p>
  )
}

/**
 * A medication of the consultation (specs/056, design «Detalle de la consulta»): its number and color, the schedule, «N de M
 * tomas» with the bar and the doses of the day chosen in the calendar (specs/023) by Mañana / Tarde / Noche (specs/015), each with
 * its toggle; then its history (extended, ended) as grey lines and «Finalizar» / «Recorrer» with outline, only for who can and
 * only when they apply. Progress and the end/extend state always count the whole medication.
 */
export function MedicationCard({ consultationId, medication, number, variant, day, today, recordOnly = false, canManage = true }: MedicationCardProps) {
  const desktop = variant === 'desktop'
  const doses = day ? dosesOfDay(medication, day) : []

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
  // Another device extended it while the dialog was open: nothing is left to cover, so the dialog closes for good —
  // otherwise it would pop up again the day new doses turn unregistered.
  if (extending && !canExtend) setExtending(false)
  const progress = medicationProgress(medication.doses)
  const hasDoses = !recordOnly && medication.doses.length > 0

  const history = [
    ...extensions.map(
      (e) =>
        `Se recorrió el ${formatDayMonth(e.createdAt)} · +${e.addedDoses} ${e.addedDoses === 1 ? 'toma' : 'tomas'}${e.manual ? ' · número ingresado manualmente' : ''}`,
    ),
    ...(medication.endedAt
      ? [`Terminado el ${formatDayMonth(medication.endedAt)} · ${progress.taken} de ${progress.total} ${progress.total === 1 ? 'toma' : 'tomas'}`]
      : []),
  ]
  const groups = groupByPeriod(doses)
  const dayName = day ? (day === today ? 'hoy' : longDay(day)) : ''

  return (
    <article
      data-medication-card
      aria-label={medication.name}
      className={`flex min-w-0 flex-col gap-3 rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${desktop ? 'px-[22px] py-5' : 'p-4'}`}
    >
      <div className={`flex ${desktop ? 'items-center gap-3.5' : 'items-start gap-3'}`}>
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-full text-[14px] font-black text-white ${medBg(number)} ${desktop ? 'h-[30px] w-[30px]' : 'h-7 w-7'}`}
        >
          {number}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className={`font-extrabold text-ink [overflow-wrap:anywhere] ${desktop ? 'text-[18px]' : 'text-[17px]'}`}>{medication.name}</h3>
          <p className="text-[14px] text-body">{scheduleLine(medication.frequencyHours, medication.durationDays, recordOnly ? null : medication.startTime)}</p>
        </div>
        {desktop && hasDoses && <ProgressBar doses={medication.doses} align="right" className="w-[200px] shrink-0" />}
      </div>

      {hasDoses && (
        <>
          {!desktop && <ProgressBar doses={medication.doses} />}
          <div aria-hidden="true" className="h-px bg-hint-edge" />
          {day && doses.length === 0 && <p className="text-[15px] text-muted">{DETAIL.noDayDoses}</p>}
          {groups.map((group) => (
            <ul key={group.key} role="group" aria-label={`${group.label}, ${medication.name}, ${dayName}`} className="flex flex-col">
              {group.doses.map((dose, i) => (
                <DoseRow
                  key={dose.id}
                  consultationId={consultationId}
                  dose={dose}
                  canManage={canManage}
                  group={i === 0 ? group.label : ''}
                  future={!!day && day > today}
                  variant={variant}
                />
              ))}
            </ul>
          ))}
        </>
      )}

      {history.map((line) => (
        <HistoryLine key={line}>{line}</HistoryLine>
      ))}

      {!recordOnly && (canEnd || canExtend) && (
        <div className={`flex flex-wrap gap-2 ${desktop ? 'justify-end' : ''}`}>
          {canEnd && (
            <button
              ref={endButton}
              type="button"
              onClick={() => {
                endMutation.reset()
                setConfirming(true)
              }}
              className={outline}
            >
              Finalizar tratamiento
            </button>
          )}
          {canExtend && (
            <button
              ref={extendButton}
              type="button"
              onClick={() => {
                extendMutation.reset()
                setExtending(true)
              }}
              className={outline}
            >
              Recorrer tratamiento
            </button>
          )}
        </div>
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
          onConfirm={(n) =>
            extendMutation.mutate(n, {
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
