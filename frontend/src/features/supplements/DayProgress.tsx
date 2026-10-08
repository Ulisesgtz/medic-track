import { dayPct } from './scheduleText'

/**
 * The day's progress bar of a supplement or an activity (specs/035 B7): an 8 px track in `hint-edge` (6 px, `thin`, in the home's
 * rows) filled in `action` (4.6:1, a graphic element needs 3:1). The color never changes with the advance, and it only counts what
 * was marked: it never judges (Principio I). The «N de M» text always goes next to it, so the bar alone is not the information.
 */
export function DayProgress({
  done,
  total,
  label,
  thin = false,
  className = '',
}: {
  done: number
  total: number
  label: string
  thin?: boolean
  className?: string
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className={`${thin ? 'h-1.5' : 'h-2'} overflow-hidden rounded-full bg-hint-edge ${className}`}
    >
      <div className="h-full rounded-full bg-action" style={{ width: `${dayPct({ done, total })}%` }} />
    </div>
  )
}
