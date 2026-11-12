import type { QueryClient } from '@tanstack/react-query'
import { dismissMarkNotice, pushMarkNotice } from './markNotices'
import { clearPendingMark, getPendingMark, setDesired, setInFlight } from './pendingMarks'
import { writeDoseToCaches, type SavedDose } from './writeDoseToCaches'
import { isOffline } from '../offline/connectivity'
import { notifyNeedsConnection } from '../offline/offlineGuard'

// One tap on a dose (specs/066, research R5): the screen changes at once and ONE request at a time travels per dose, so the
// screen and the server end in the state of the last tap whatever order the answers come in, and no mark is saved twice.
// A failure takes the screen back and says so: a dose the server didn't save never stays marked (FR-005).

export interface MarkTarget {
  id: string
  /** The medication, supplement or activity, and the dose's hour: what the notice names. */
  name: string
  time: string
}

export interface MarkRequest {
  queryClient: QueryClient
  dose: MarkTarget
  taken: boolean
  /** Asks the server; answers the dose it saved (or nothing, when the endpoint doesn't say). */
  send: (taken: boolean) => Promise<unknown>
  /** Asks the screens' data again, as before this feature. */
  invalidate: () => unknown
  /** The last tap got saved. */
  onSaved?: () => void
}

type Failure = 'silent' | 'not_yours' | 'gone' | 'failed'

/** What an API error of any feature means for a mark, by its `kind` (each feature has its own error class). */
export function failureOf(error: unknown): Failure {
  const kind = String((error as { kind?: unknown } | null)?.kind ?? '')
  if (kind === 'nothing_to_mark') return 'silent'
  if (kind === 'forbidden') return 'not_yours'
  if (kind.endsWith('not_found') || kind === 'no_access') return 'gone'
  return 'failed'
}

function asSavedDose(answer: unknown): SavedDose | undefined {
  const dose = answer as Partial<SavedDose> | null | undefined
  return dose && typeof dose === 'object' && typeof dose.id === 'string' && typeof dose.taken === 'boolean' ? (dose as SavedDose) : undefined
}

export async function requestMark({ queryClient, dose, taken, send, invalidate, onSaved }: MarkRequest): Promise<void> {
  // Without a connection the mark is never painted nor sent (specs/067, FR-007): it would look saved when it isn't.
  if (isOffline()) {
    notifyNeedsConnection('mark')
    return
  }
  setDesired(dose.id, taken)
  // A request for this dose already travels: when it answers, it sends this tap's state if it is another.
  if (getPendingMark(dose.id)?.inFlight) return
  setInFlight(dose.id, true)

  for (;;) {
    const wanted = getPendingMark(dose.id)?.taken ?? taken
    let saved: SavedDose | undefined
    try {
      saved = asSavedDose(await send(wanted))
    } catch (error) {
      clearPendingMark(dose.id)
      const failure = failureOf(error)
      if (failure !== 'silent') {
        const kind = failure === 'failed' ? (wanted ? 'not_saved' : 'not_unmarked') : failure
        pushMarkNotice({ doseId: dose.id, kind, name: dose.name, time: dose.time })
      }
      void invalidate()
      return
    }

    if (saved) writeDoseToCaches(queryClient, saved)
    const latest = getPendingMark(dose.id)
    if (latest && latest.taken !== wanted) continue

    clearPendingMark(dose.id)
    const by = saved?.takenBy as { name?: string; mine?: boolean } | null | undefined
    if (wanted && saved?.taken && by && by.mine === false) {
      // The first mark wins (specs/032): the server answered the dose as somebody else had already marked it. Not a failure.
      pushMarkNotice({ doseId: dose.id, kind: 'marked_by_other', name: dose.name, time: dose.time, by: by.name })
    } else {
      dismissMarkNotice(dose.id)
    }
    void invalidate()
    onSaved?.()
    return
  }
}
