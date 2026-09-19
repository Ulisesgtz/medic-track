import { useEffect, useState } from 'react'
import { localDayRange } from './date'

/**
 * The parent's local "today" as [from, to), kept current: it rolls over at
 * local midnight (timer) and re-checks when the app returns to the
 * foreground — an installed PWA can sit open overnight, and background tabs
 * throttle timers. The range object only changes when the day does, so it is
 * safe to put in a query key.
 */
export function useLocalDay(): { from: Date; to: Date } {
  const [day, setDay] = useState(() => localDayRange())

  useEffect(() => {
    function refresh() {
      const next = localDayRange()
      setDay((prev) => (next.from.getTime() === prev.from.getTime() ? prev : next))
    }

    // +500ms so the check lands just after midnight, not just before it.
    const timer = setTimeout(refresh, Math.max(day.to.getTime() - Date.now(), 0) + 500)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [day])

  return day
}
