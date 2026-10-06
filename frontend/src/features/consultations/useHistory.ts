import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchHistoryOptions, searchConsultations } from './api'
import { EMPTY_CRITERIA, rangeInverted, readStored, toRequest, writeStored, type HistoryCriteria } from './historyCriteria'

/** How long the text waits after the last key before the list is asked again. Everything else applies at once. */
export const SEARCH_DEBOUNCE_MS = 300

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * The history's criteria (specs/031): what the form shows (`criteria`), what is actually asked of the server (`applied`:
 * the same, with the text delayed so a word isn't searched letter by letter) and how to change them. They start from
 * what the tab kept for this child and are kept again at every change (FR-012). Remount the screen per child (`key`).
 */
export function useHistoryCriteria(childId: string) {
  const [criteria, setCriteria] = useState<HistoryCriteria>(() => readStored(childId))
  const q = useDebounced(criteria.q, SEARCH_DEBOUNCE_MS)
  const applied = useMemo(() => ({ ...criteria, q }), [criteria, q])

  useEffect(() => {
    writeStored(childId, criteria)
  }, [childId, criteria])

  const update = useCallback((patch: Partial<HistoryCriteria>) => setCriteria((current) => ({ ...current, ...patch })), [])
  const clear = useCallback(() => setCriteria(EMPTY_CRITERIA), [])
  return { criteria, applied, update, clear }
}

/**
 * The consultations that meet the criteria. The previous list stays on screen while the next one loads (no blank flash,
 * FR-014); a range turned around isn't asked of the server. `enabled` is false for a free account: it is the paid
 * plan's, and the server would refuse it anyway.
 */
export function useHistorySearch(childId: string, applied: HistoryCriteria, enabled: boolean) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['history', childId, applied],
    queryFn: async () => searchConsultations(childId, toRequest(applied), await getToken()),
    enabled: enabled && !!childId && !rangeInverted(applied),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** The doctors and medications registered for the child: asked once, not at every key. */
export function useHistoryOptions(childId: string, enabled: boolean) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: ['history-options', childId],
    queryFn: async () => fetchHistoryOptions(childId, await getToken()),
    enabled: enabled && !!childId,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
