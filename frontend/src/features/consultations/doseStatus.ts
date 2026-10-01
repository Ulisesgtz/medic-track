import type { DoseStatus } from './types'

// What each dose looks like to the parent (specs/013). The status comes from the server, computed with its own clock,
// so every device shows the same and the phone's clock never decides it.

/** Screens that show doses ask for them again every minute while visible, so a dose turns "sin registrar" on its own. */
export const DOSE_REFETCH_MS = 60_000

/** specs/016: a dose the parent's early end of the treatment made unnecessary. Neutral: it says what happened. */
export const CANCELED_LABEL = 'Cancelada'

/** Only ever this — never "no tomada" or "olvidada": nobody marked it, that's all the app knows (Principio I). */
export const UNREGISTERED_LABEL = 'Sin registrar'

/**
 * The time chip of each state. "Sin registrar" is told apart without colour: a dashed border and its own words
 * (never red — not a medical alert — and never amber, which means "por marcar").
 */
export const DOSE_CHIP_STYLE: Record<DoseStatus, string> = {
  taken: 'bg-confirmed text-white',
  due: 'border-[1.5px] border-pending bg-pending-soft text-[#92400e]',
  pending: 'bg-slate-100 text-slate-600',
  unregistered: 'border-[1.5px] border-dashed border-slate-400 bg-surface text-slate-700',
  // specs/016: the treatment was ended before this dose's time; it is kept, not marked, not markable.
  canceled: 'border-[1.5px] border-dashed border-slate-300 bg-surface text-slate-500',
}

/**
 * The chip of the day list of the treatment calendar (specs/022): the design's own shapes, by the same server status.
 * Amber stays "por marcar" and "sin registrar" stays dashed (specs/013: never amber, Principio I).
 */
export const CALENDAR_CHIP_STYLE: Record<DoseStatus, string> = {
  taken: 'border-[#10b981] bg-[#ecfdf5] text-[#047857]',
  due: 'border-[#f59e0b] bg-[#fffbeb] text-[#92400e] hover:bg-[#fef3c7]',
  pending: 'border-dashed border-[#cbd5e1] bg-white text-[#475569]',
  unregistered: 'border-dashed border-slate-400 bg-white text-slate-700',
  canceled: 'border-dashed border-slate-300 bg-white text-slate-500',
}

/** The second line of a calendar chip, by status ("próxima" is only for the next pending dose of the day). */
export const CALENDAR_CHIP_NOTE: Record<DoseStatus, string | null> = {
  taken: 'dada',
  due: 'por marcar',
  pending: null,
  unregistered: 'sin registrar',
  canceled: 'cancelada',
}

interface DoseLike {
  status?: DoseStatus
  taken: boolean
  scheduledAt: string
}

/**
 * The status the server sent. Only if it is missing (a backend from before specs/013 answering a newer frontend,
 * while both versions coexist) it falls back to what the phone can tell: taken, or pending/due by the time.
 */
export function statusOf(dose: DoseLike): DoseStatus {
  if (dose.status) return dose.status
  if (dose.taken) return 'taken'
  return new Date(dose.scheduledAt).getTime() > Date.now() ? 'pending' : 'due'
}

/** "Sin marcar": not marked and still in time (pending or due). What "Marcar tomas" marks. */
export function isUnmarked(dose: DoseLike): boolean {
  const status = statusOf(dose)
  return status === 'pending' || status === 'due'
}

export function isUnregistered(dose: DoseLike): boolean {
  return statusOf(dose) === 'unregistered'
}

/** "1 sin registrar" / "3 sin registrar". */
export function unregisteredText(count: number): string {
  return `${count} sin registrar`
}
