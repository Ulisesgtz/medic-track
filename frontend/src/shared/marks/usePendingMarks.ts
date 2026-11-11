import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { applyPendingMarks } from './applyPendingMarks'
import { pendingMarksSnapshot, subscribePendingMarks } from './pendingMarks'

/** After this long without an answer a mark says «guardando…» (specs/066, FR-007): sooner it would blink on a good connection. */
export const SLOW_MS = 2000

/** The data of a query with the marks that still travel applied: what every screen that shows doses reads. */
export function useShown<T>(data: T): T {
  const marks = useSyncExternalStore(subscribePendingMarks, pendingMarksSnapshot, pendingMarksSnapshot)
  return useMemo(() => applyPendingMarks(data, marks), [data, marks])
}

/** A query's result with its data shown through `useShown`. */
export function useShownQuery<Q extends { data: unknown }>(query: Q): Q {
  const data = useShown(query.data)
  return data === query.data ? query : { ...query, data }
}

/** Whether a dose's mark still travels, and whether it has for long enough to say so. */
export function usePendingMark(doseId: string | undefined): { pending: boolean; slow: boolean } {
  const marks = useSyncExternalStore(subscribePendingMarks, pendingMarksSnapshot, pendingMarksSnapshot)
  const since = doseId ? marks.get(doseId)?.since : undefined
  const [slowSince, setSlowSince] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (since === undefined) return
    const timer = setTimeout(() => setSlowSince(since), SLOW_MS)
    return () => clearTimeout(timer)
  }, [since])

  return { pending: since !== undefined, slow: since !== undefined && slowSince === since }
}
