import type { Dose } from './types'
import { isUnregistered } from './doseStatus'

// specs/014: how far a medication's treatment is, derived from its doses. Only what the parent marked counts as
// progress; doses "sin registrar" are told apart and never counted (Principio I: no evaluation, no advice).

export interface MedicationProgress {
  taken: number
  total: number
  unregistered: number
}

export function medicationProgress(doses: Dose[]): MedicationProgress {
  return {
    taken: doses.filter((d) => d.taken).length,
    total: doses.length,
    unregistered: doses.filter(isUnregistered).length,
  }
}

/** "3 / 9 tomas", "0 / 1 toma". */
export function progressText({ taken, total }: Pick<MedicationProgress, 'taken' | 'total'>): string {
  return `${taken} / ${total} ${total === 1 ? 'toma' : 'tomas'}`
}

/** " · 2 sin registrar", or nothing when there are none. */
export function unregisteredSuffix(unregistered: number): string {
  return unregistered > 0 ? ` · ${unregistered} sin registrar` : ''
}
