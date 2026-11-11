import type { QueryClient } from '@tanstack/react-query'

// What the server saved goes into every cached answer that has the dose (specs/066, research R6), before the pending mark is
// dropped: otherwise the dose would show unmarked for a moment, until the screens ask again.

export interface SavedDose {
  id: string
  taken: boolean
  status?: string
  takenBy?: unknown
}

const DOSE_QUERIES = new Set(['consultation', 'overview', 'routines', 'routine', 'child-device'])

function replace(value: unknown, dose: SavedDose): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const written = replace(item, dose)
      if (written !== item) changed = true
      return written
    })
    return changed ? next : value
  }
  if (value === null || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  if (record.id === dose.id && typeof record.taken === 'boolean' && typeof record.scheduledAt === 'string') {
    return { ...record, taken: dose.taken, status: dose.status ?? record.status, takenBy: dose.takenBy ?? null }
  }
  let copy: Record<string, unknown> | null = null
  for (const [key, child] of Object.entries(record)) {
    if (child === null || typeof child !== 'object') continue
    const written = replace(child, dose)
    if (written === child) continue
    copy ??= { ...record }
    copy[key] = written
  }
  return copy ?? value
}

export function writeDoseToCaches(queryClient: QueryClient, dose: SavedDose) {
  queryClient.setQueriesData({ predicate: (query) => DOSE_QUERIES.has(String(query.queryKey[0])) }, (data: unknown) =>
    data === undefined ? data : replace(data, dose),
  )
}
