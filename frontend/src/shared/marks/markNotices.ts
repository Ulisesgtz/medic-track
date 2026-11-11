import type { MarkNoticeKind } from './markText'

// The notices of the marks that didn't get saved (specs/066): one per dose, in memory, shown once per screen by `MarkNotice`.
// A notice only repeats the name and the hour already on the screen.

export interface MarkNoticeEntry {
  doseId: string
  kind: MarkNoticeKind
  name: string
  time: string
  /** The first name of who had marked it before (`marked_by_other`). */
  by?: string
}

let notices: readonly MarkNoticeEntry[] = []
const listeners = new Set<() => void>()

function commit(next: readonly MarkNoticeEntry[]) {
  notices = next
  listeners.forEach((listener) => listener())
}

/** A new notice of a dose replaces its previous one and goes last. */
export function pushMarkNotice(entry: MarkNoticeEntry) {
  commit([...notices.filter((n) => n.doseId !== entry.doseId), entry])
}

export function dismissMarkNotice(doseId: string) {
  if (notices.some((n) => n.doseId === doseId)) commit(notices.filter((n) => n.doseId !== doseId))
}

export function dismissAllMarkNotices() {
  if (notices.length > 0) commit([])
}

export function markNoticesSnapshot(): readonly MarkNoticeEntry[] {
  return notices
}

export function subscribeMarkNotices(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tests only. */
export function resetMarkNotices() {
  commit([])
}
