import { useId } from 'react'
import { Link } from 'react-router-dom'
import { ActivityTypeIcon } from './ActivityTypeIcon'
import { activityCount } from './activityTypeText'
import type { ActivityTypeSegment } from './groupByActivityType'
import { activityRowText, routineStatusLabel } from './scheduleText'
import type { Routine } from './types'

type Variant = 'phone' | 'desktop'

const chipBase = 'flex-none rounded-full text-[12px] font-extrabold tracking-[0.08em] uppercase'
// «Activa» is the hint chip; «Pausada» and «Terminada» the quiet slate one (mock A).
const chipActive = `${chipBase} border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-action`
const chipQuiet = `${chipBase} bg-slate-100 px-2.5 py-1 text-muted`

function ActivityRow({ routine, variant }: { routine: Routine; variant: Variant }) {
  const to = `/actividades/${routine.id}`
  const status = <span className={routine.status === 'active' ? chipActive : chipQuiet}>{routineStatusLabel('activity', routine.status)}</span>
  if (variant === 'desktop')
    return (
      <Link
        to={to}
        className="grid min-h-14 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-4 border-t border-hint-edge px-5 py-2 hover:bg-canvas"
      >
        <span className="text-base leading-[normal] font-extrabold text-ink [overflow-wrap:anywhere]">{routine.name}</span>
        <span className="text-[15px] leading-[normal] text-body">{activityRowText(routine)}</span>
        {status}
      </Link>
    )
  return (
    <Link to={to} className="flex min-h-16 items-center justify-between gap-3 border-t border-hint-edge px-4 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-base leading-[normal] font-extrabold text-ink [overflow-wrap:anywhere]">{routine.name}</span>
        <span className="text-sm leading-[normal] text-body">{activityRowText(routine)}</span>
      </span>
      {status}
    </Link>
  )
}

/**
 * One segment of «Actividades» (specs/075, mock A and E): a card of its own — the type's icon and name as a title, the count at the
 * right — with the compact rows of always under it, separated by a thin line. The title is ink text and the icon the one action color:
 * no type has a color of its own and nothing counts «done» per type, so the segments organize and never grade (Principio I).
 */
export function ActivitySegmentCard({ segment, variant }: { segment: ActivityTypeSegment; variant: Variant }) {
  const titleId = useId()
  const pad = variant === 'desktop' ? 'px-5' : 'px-4'
  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-[22px] border border-hint-edge bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <div className={`flex items-center justify-between gap-2.5 pt-3.5 pb-2.5 ${pad}`}>
        <h3 id={titleId} className="m-0 flex items-center gap-2.5 text-[17px] leading-[normal] font-extrabold text-ink">
          <ActivityTypeIcon code={segment.code} />
          {segment.name}
        </h3>
        <span className="text-[13px] leading-[normal] font-bold whitespace-nowrap text-muted">{activityCount(segment.routines.length)}</span>
      </div>
      {segment.routines.map((routine) => (
        <ActivityRow key={routine.id} routine={routine} variant={variant} />
      ))}
    </section>
  )
}
