// WHAT may be kept on the phone (specs/067, research R6, R8): an allow list — a query key that isn't here is never kept — no photo
// at all (FR-010) and 7 days per answer (FR-013). Pure, so the privacy rules are tested on their own.

export const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The first part of the query keys whose answers may be kept. Not kept, on purpose: the photos (`cabinet-photo`, one image of
 * `vaccine-photos`), the history's search, growth, the plan, the reminders' setup, the child's access links and invitations.
 * **A new screen that must be seen offline adds its key here.**
 */
export const PERSISTED_ROOTS: ReadonlySet<string> = new Set([
  'accounts',
  'overview',
  'consultations',
  'consultation',
  'routines',
  'routine',
  'appointments',
  'cabinet',
  'cabinet-item',
  'vaccinations',
  'vaccine-photos',
  'family',
  'child-device',
  'catalog',
])

export function shouldPersist(queryKey: readonly unknown[], status: string): boolean {
  if (status !== 'success') return false
  const root = queryKey[0]
  if (typeof root !== 'string' || !PERSISTED_ROOTS.has(root)) return false
  // `['vaccine-photos', childId]` is the list (metadata); `['vaccine-photos', childId, id]` is one image.
  if (root === 'vaccine-photos' && queryKey.length > 2) return false
  return true
}

const isImageText = (value: unknown) => typeof value === 'string' && value.startsWith('data:image')

function stripImages(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripImages)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'photoBase64' && typeof inner === 'string') {
        // The consultation carries its prescription inside (spec 004): kept without it, saying there was one.
        out[key] = ''
        if (inner !== '') out.photoOmitted = true
      } else if (!isImageText(inner)) {
        out[key] = stripImages(inner)
      }
    }
    return out
  }
  return value
}

/** The answer as it may be kept: the same data without any photo. */
export function stripForStorage(data: unknown): unknown {
  return stripImages(data)
}

export function isExpired(dataUpdatedAt: number, now: number): boolean {
  return now - dataUpdatedAt > OFFLINE_MAX_AGE_MS
}

/** A failure that means the server no longer gives this answer to this session (FR-014). */
export function isGoneError(error: unknown): boolean {
  const kind = (error as { kind?: unknown } | null)?.kind
  if (typeof kind !== 'string') return false
  return kind === 'forbidden' || kind === 'no_access' || kind.endsWith('not_found')
}
