// specs/031-historial-busqueda-filtros: what the parent has asked of the history. It lives in the tab (sessionStorage, per
// child), never in the address: the text can be health information about the child, and an address reaches logs the
// parent doesn't control (research R1, R10).

export type HistoryKind = 'all' | 'treatment' | 'record'

export interface HistoryCriteria {
  /** Text: the doctor, the notes or a medication, ignoring case and accents. */
  q: string
  /** "YYYY-MM-DD" or ''. */
  from: string
  to: string
  /** A doctor / a medication exactly as registered, or '' for any. */
  doctor: string
  medication: string
  /** Catalog codes: the consultation must have all of them. */
  symptomCodes: string[]
  kind: HistoryKind
}

export const EMPTY_CRITERIA: HistoryCriteria = { q: '', from: '', to: '', doctor: '', medication: '', symptomCodes: [], kind: 'all' }

/** The body of `POST …/consultations/search`: only what is given. */
export interface HistorySearchRequest {
  q?: string
  from?: string
  to?: string
  doctor?: string
  medication?: string
  symptomCodes?: string[]
  kind?: HistoryKind
}

/** How many criteria are on: the text, each date, the doctor, the medication, each symptom and a kind other than "all". */
export function activeCount(c: HistoryCriteria): number {
  return (
    (c.q.trim() ? 1 : 0) +
    (c.from ? 1 : 0) +
    (c.to ? 1 : 0) +
    (c.doctor ? 1 : 0) +
    (c.medication ? 1 : 0) +
    c.symptomCodes.length +
    (c.kind !== 'all' ? 1 : 0)
  )
}

/** The criteria besides the text (what the phone's "Filtros" button counts). */
export function filterCount(c: HistoryCriteria): number {
  return activeCount({ ...c, q: '' })
}

export const isEmpty = (c: HistoryCriteria) => activeCount(c) === 0

/** A range turned around: it is not asked of the server (which would refuse it); the screen says so in the field. */
export const rangeInverted = (c: HistoryCriteria) => c.from !== '' && c.to !== '' && c.to < c.from

/** The request for these criteria: empty ones are left out and the text is trimmed. */
export function toRequest(c: HistoryCriteria): HistorySearchRequest {
  const request: HistorySearchRequest = {}
  const q = c.q.trim()
  if (q) request.q = q
  if (c.from) request.from = c.from
  if (c.to) request.to = c.to
  if (c.doctor) request.doctor = c.doctor
  if (c.medication) request.medication = c.medication
  if (c.symptomCodes.length > 0) request.symptomCodes = c.symptomCodes
  if (c.kind !== 'all') request.kind = c.kind
  return request
}

const KINDS: readonly HistoryKind[] = ['all', 'treatment', 'record']
const storageKey = (childId: string) => `historial:${childId}`

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** Reads what was kept for the child; anything missing, broken or of the wrong type falls back to "no criteria". */
export function readStored(childId: string): HistoryCriteria {
  try {
    const raw = window.sessionStorage.getItem(storageKey(childId))
    if (!raw) return EMPTY_CRITERIA
    const data = JSON.parse(raw) as Record<string, unknown>
    if (typeof data !== 'object' || data === null) return EMPTY_CRITERIA
    const codes = Array.isArray(data.symptomCodes) ? data.symptomCodes.filter((code): code is string => typeof code === 'string') : []
    return {
      q: text(data.q),
      from: text(data.from),
      to: text(data.to),
      doctor: text(data.doctor),
      medication: text(data.medication),
      symptomCodes: codes,
      kind: KINDS.includes(data.kind as HistoryKind) ? (data.kind as HistoryKind) : 'all',
    }
  } catch {
    return EMPTY_CRITERIA
  }
}

/** Keeps the criteria for the child while the tab lives; with nothing on, nothing is kept. Never throws (storage may be blocked). */
export function writeStored(childId: string, criteria: HistoryCriteria) {
  try {
    if (isEmpty(criteria)) window.sessionStorage.removeItem(storageKey(childId))
    else window.sessionStorage.setItem(storageKey(childId), JSON.stringify(criteria))
  } catch {
    // Without storage the screen works the same, it just doesn't remember.
  }
}
