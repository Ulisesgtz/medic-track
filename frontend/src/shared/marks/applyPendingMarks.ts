import type { PendingMarks } from './pendingMarks'

// What a screen shows of a dose whose mark travels (specs/066, research R4). Pure: it never reads the clock, and it only puts
// or removes the mark — which state an unmarked dose has («por marcar», «sin registrar») is the server's to say (FR-011), so
// an unmarked one waits as `pending`, the state with no label.

interface DoseShape {
  id: string
  scheduledAt: string
  taken: boolean
}

function isDose(value: object): value is DoseShape {
  const v = value as Partial<DoseShape>
  return typeof v.id === 'string' && typeof v.scheduledAt === 'string' && typeof v.taken === 'boolean'
}

function walk(value: unknown, marks: PendingMarks): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const shown = walk(item, marks)
      if (shown !== item) changed = true
      return shown
    })
    return changed ? next : value
  }
  if (value === null || typeof value !== 'object') return value

  let source = value as Record<string, unknown>
  let copy: Record<string, unknown> | null = null
  if (isDose(value)) {
    const mark = marks.get(value.id)
    if (mark) {
      copy = mark.taken
        ? // An own mark, with the hour of the tap and no name: «por Ana» comes with the server's answer.
          { ...source, taken: true, status: 'taken', takenBy: { name: '', at: new Date(mark.since).toISOString(), mine: true } }
        : { ...source, taken: false, status: 'pending', takenBy: null }
      source = copy
    }
  }
  for (const [key, child] of Object.entries(source)) {
    if (child === null || typeof child !== 'object') continue
    const shown = walk(child, marks)
    if (shown === child) continue
    copy ??= { ...source }
    copy[key] = shown
  }
  return copy ?? value
}

/** The same data with every dose that has an unconfirmed mark shown as tapped. With no marks: the very same object. */
export function applyPendingMarks<T>(data: T, marks: PendingMarks): T {
  if (marks.size === 0) return data
  return walk(data, marks) as T
}
