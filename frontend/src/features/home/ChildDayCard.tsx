import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAgeLong } from '../../shared/age'
import { formatTime } from '../../shared/date'
import { DayRow } from '../../shared/ui/DayRow'
import { useOverviewDoseToggle } from '../consultations/useDoseToggle'
import type { OverviewDose } from '../consultations/types'
import type { Child } from './types'
import type { ChildDay } from './daySummary'
import { useChildDay } from './useChildDay'
import {
  HOME,
  activitiesDone,
  cardLabel,
  loadFailed,
  markLabel,
  markedAt,
  medicationsValue,
  nameAtTime,
  ofTotal,
  toMarkChip,
  unregisteredLine,
} from './homeText'

type Variant = 'phone' | 'desktop'

/** How long the footer keeps saying «✓ HH:MM» for the dose just marked before it moves on to the next one: one refresh. */
export const MARKED_SHOWN_MS = 60_000

const shadow = 'shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const pill = 'self-start rounded-full text-[13px] font-extrabold'

function Chip({ day }: { day: ChildDay }) {
  if (day.state === 'pend')
    return (
      <span className={`${pill} inline-flex items-center gap-1.5 bg-pending-soft px-2.5 py-[3px] text-on-pending-chip`}>
        <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full border-2 border-pending-dot" />
        {toMarkChip(day.toMark)}
      </span>
    )
  if (day.state === 'ok') return <span className={`${pill} bg-confirmed-soft px-2.5 py-[3px] text-confirmed-strong`}>{HOME.allMarked}</span>
  if (day.state === 'sinreg')
    return (
      <span className={`${pill} border-[1.5px] border-dashed border-calendar-muted px-2.5 py-0.5 text-body`}>{HOME.unregisteredChip}</span>
    )
  return null
}

interface Held {
  dose: OverviewDose
  time: string
}

/**
 * The footer of the card: the next unmarked dose and «Marcar» (specs/055 FR-006), outside the card's link so tapping it never
 * opens the child. A dose just marked stays here as «✓ HH:MM» for a minute (tapping it takes the mark back), then the next one.
 */
function Footer({
  dose,
  held,
  heldTime,
  onMarked,
  onUnmarked,
  childName,
  variant,
}: {
  dose: OverviewDose
  held: boolean
  heldTime: string | undefined
  onMarked: () => void
  onUnmarked: () => void
  childName: string
  variant: Variant
}) {
  const toggle = useOverviewDoseToggle(dose)
  const time = formatTime(dose.scheduledAt)
  const label = markLabel(dose.medicationName, time, childName)
  return (
    <div
      className={`mt-2 flex items-center justify-between gap-3 border-t border-hint-edge ${variant === 'desktop' ? 'px-5 pt-3 pb-4' : 'px-4 pt-2.5 pb-3.5'}`}
    >
      <span className="flex min-w-0 flex-col gap-px">
        <span className="text-[13px] font-bold text-muted">{HOME.next}</span>
        <span className="text-[15px] font-extrabold text-ink">{nameAtTime(dose.medicationName, time)}</span>
      </span>
      <button
        type="button"
        aria-pressed={held}
        aria-label={label}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(!held, { onSuccess: held ? onUnmarked : onMarked })}
        className={
          held
            ? 'min-h-11 shrink-0 cursor-pointer rounded-[14px] bg-confirmed-soft px-3.5 text-[15px] font-extrabold text-confirmed-strong'
            : 'min-h-11 min-w-24 shrink-0 cursor-pointer rounded-[14px] border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-hint'
        }
      >
        {held ? markedAt(heldTime ?? '') : HOME.mark}
      </button>
    </div>
  )
}

/**
 * One child on the home (specs/055, US1): avatar, name and age, the day's chip and, only for what the child has today, the rows
 * Medicamentos / Suplementos / Actividades. The footer offers the next dose to mark. Counts only: the server's `status` says what
 * each dose is (Principio I) — amber only means «not marked yet», «sin registrar» is dashed and grey.
 */
export function ChildDayCard({ child, variant, index }: { child: Child; variant: Variant; index: number }) {
  const desktop = variant === 'desktop'
  const { day, isPending, isError, refetch } = useChildDay(child.id)
  const [held, setHeld] = useState<Held | null>(null)
  useEffect(() => {
    if (!held) return
    const timer = setTimeout(() => setHeld(null), MARKED_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [held])

  if (isPending)
    return (
      <div
        aria-hidden="true"
        className={`flex flex-col gap-3.5 rounded-[22px] border-[1.5px] border-hint-edge bg-surface p-[18px] ${desktop ? 'h-[280px]' : 'h-[264px]'}`}
      >
        <span className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-full bg-skel" />
          <span className="h-5 w-40 rounded-md bg-skel" />
        </span>
        <span className="h-11 rounded-xl bg-skel" />
        <span className="h-11 rounded-xl bg-skel" />
        <span className="h-11 rounded-xl bg-skel" />
      </div>
    )

  const footer = held?.dose ?? day?.next ?? null
  const avatar = index % 2 === 1 ? 'bg-confirmed' : 'bg-action'
  const border = day?.state === 'sinreg' ? 'border-2 border-dashed border-calendar-muted' : 'border-[1.5px] border-transparent'

  return (
    <article className={`flex min-w-0 flex-col overflow-hidden rounded-[22px] bg-surface ${shadow} ${border}`}>
      <Link
        to={`/children/${child.id}`}
        aria-label={cardLabel(child.firstName)}
        className={`flex flex-col gap-2.5 text-inherit no-underline ${desktop ? 'px-5 pt-5 pb-2 hover:bg-canvas' : 'px-4 pt-4 pb-1.5'}`}
      >
        <span className={`flex items-center ${desktop ? 'gap-3.5' : 'gap-3'}`}>
          <span
            aria-hidden="true"
            className={`flex shrink-0 items-center justify-center rounded-full font-black text-white ${avatar} ${desktop ? 'h-12 w-12 text-[19px]' : 'h-11 w-11 text-lg'}`}
          >
            {child.firstName.charAt(0)}
          </span>
          <span className={`flex min-w-0 flex-1 flex-col ${desktop ? 'gap-[5px]' : 'gap-1'}`}>
            <span className={`font-extrabold text-ink ${desktop ? 'text-lg' : 'text-[17px]'}`}>
              {child.firstName} <span className="font-medium text-body">· {formatAgeLong(child.birthDate)}</span>
            </span>
            {day && <Chip day={day} />}
          </span>
          <span aria-hidden="true" className="text-[22px] text-action">
            ›
          </span>
        </span>

        {isError && <span className="pb-2 text-[15px] text-body">{loadFailed(child.firstName)}</span>}
        {day?.state === 'vacio' && (
          <span className={`text-[15px] text-muted ${desktop ? 'pt-1 pb-3 pl-[62px]' : 'pt-1 pb-2.5 pl-14'}`}>{HOME.nothingToday}</span>
        )}
        {day?.medications && <DayRow kind="med" title={HOME.medications} value={medicationsValue(day.medications)} variant={variant} />}
        {day?.supplements && (
          <DayRow kind="sup" title={HOME.supplements} value={ofTotal(day.supplements.marked, day.supplements.total)} variant={variant} />
        )}
        {day?.activities && (
          <DayRow kind="act" title={HOME.activities} value={activitiesDone(day.activities.done, day.activities.total)} variant={variant} />
        )}
        {day?.unregistered && (
          <span className="ml-12 self-start rounded-[10px] border-[1.5px] border-dashed border-calendar-muted px-2.5 py-1.5 text-sm text-body">
            {unregisteredLine(day.unregistered.medicationName, formatTime(day.unregistered.scheduledAt))}
          </span>
        )}
      </Link>

      {isError && (
        <div className={`flex justify-end ${desktop ? 'px-5 pb-4' : 'px-4 pb-3.5'}`}>
          <button
            type="button"
            onClick={refetch}
            className="min-h-11 cursor-pointer rounded-[14px] border-2 border-action px-4 text-[15px] font-extrabold text-action"
          >
            {HOME.retry}
          </button>
        </div>
      )}
      {footer && (
        <Footer
          key={footer.id}
          dose={footer}
          held={held !== null}
          heldTime={held?.time}
          onMarked={() => setHeld({ dose: footer, time: formatTime(new Date()) })}
          onUnmarked={() => setHeld(null)}
          childName={child.firstName}
          variant={variant}
        />
      )}
    </article>
  )
}
