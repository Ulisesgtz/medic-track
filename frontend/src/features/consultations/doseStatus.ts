import type { DoseStatus } from './types'

// What each dose looks like to the parent (specs/013). The status comes from the server, computed with its own clock,
// so every device shows the same and the phone's clock never decides it.

/** Screens that show doses ask for them again every minute while visible, so a dose turns "sin registrar" on its own. */
export const DOSE_REFETCH_MS = 60_000

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
}

interface HasStatus {
  status: DoseStatus
}

/** "Sin marcar": not marked and still in time (pending or due). What "Marcar tomas" marks. */
export function isUnmarked(dose: HasStatus): boolean {
  return dose.status === 'pending' || dose.status === 'due'
}

export function isUnregistered(dose: HasStatus): boolean {
  return dose.status === 'unregistered'
}

/** "1 sin registrar" / "3 sin registrar". */
export function unregisteredText(count: number): string {
  return `${count} sin registrar`
}
