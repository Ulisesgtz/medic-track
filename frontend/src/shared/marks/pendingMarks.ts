// The marks the server hasn't confirmed yet (specs/066, research R3): the dose the person just tapped shows its new state at
// once, on every screen, while its request travels. It lives in memory only — never in `localStorage` — and holds nothing but
// the dose's id and what was tapped: what the server saved always wins when it answers.

export interface PendingMark {
  /** The state of the last tap. */
  taken: boolean
  /** When it was tapped: the provisional hour of an own mark and the start of «guardando…». */
  since: number
  /** A request for this dose is on its way (never two at once). */
  inFlight: boolean
}

export type PendingMarks = ReadonlyMap<string, PendingMark>

let marks: PendingMarks = new Map()
const listeners = new Set<() => void>()

function commit(next: Map<string, PendingMark>) {
  marks = next
  listeners.forEach((listener) => listener())
}

/** The person tapped: the screen goes ahead of the server from now. */
export function setDesired(doseId: string, taken: boolean, now: number = Date.now()) {
  const next = new Map(marks)
  next.set(doseId, { taken, since: now, inFlight: marks.get(doseId)?.inFlight ?? false })
  commit(next)
}

export function setInFlight(doseId: string, inFlight: boolean) {
  const current = marks.get(doseId)
  if (!current || current.inFlight === inFlight) return
  const next = new Map(marks)
  next.set(doseId, { ...current, inFlight })
  commit(next)
}

export function getPendingMark(doseId: string): PendingMark | undefined {
  return marks.get(doseId)
}

/** The server answered (or the request failed): the screen shows what the server has again. */
export function clearPendingMark(doseId: string) {
  if (!marks.has(doseId)) return
  const next = new Map(marks)
  next.delete(doseId)
  commit(next)
}

/** The same reference while nothing changes (`useSyncExternalStore`). */
export function pendingMarksSnapshot(): PendingMarks {
  return marks
}

export function subscribePendingMarks(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tests only. */
export function resetPendingMarks() {
  commit(new Map())
}
