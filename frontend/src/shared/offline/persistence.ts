import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { isInstalledPhone } from './device'
import { clearAll, put, readAll, readMeta, remove, SCHEMA, writeMeta, type StoredQuery } from './idbStore'
import { isExpired, isGoneError, shouldPersist, stripForStorage } from './persistPolicy'

// Keeping on the phone what the session already saw, and forgetting it (specs/067, research R3, R5, R8). Only the app installed on a
// phone writes anything (FR-012); each answer is its own entry with the hour the server sent it; whose they are is in the meta.
// Removing a query from memory by itself (TanStack's garbage collection after 5 minutes) does NOT forget it: the copy is for when
// the screen is opened again without a signal. It is forgotten when the server no longer gives it, after 7 days, or on a logout.

const hourMs = 60 * 60 * 1000
export const PRUNE_EVERY_MS = hourMs

let stopListening: (() => void) | null = null
let currentOwner: string | null = null

function toEntry(queryHash: string, queryKey: QueryKey, data: unknown, dataUpdatedAt: number): StoredQuery {
  return { queryHash, queryKey, data: stripForStorage(data), dataUpdatedAt }
}

/** Forget one answer, in memory and on the phone. */
export async function forgetQuery(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  const query = queryClient.getQueryCache().find({ queryKey, exact: true })
  queryClient.removeQueries({ queryKey, exact: true })
  if (query && isInstalledPhone()) await remove(query.queryHash)
}

/**
 * Start keeping the answers of `owner` (`user:<clerkUserId>` or `child:<childId>`). On anything but the installed phone it does
 * nothing. Another owner's copy is wiped first. Returns the function that stops it.
 */
export async function startPersistence(queryClient: QueryClient, owner: string): Promise<() => void> {
  if (!isInstalledPhone()) return () => {}
  if (currentOwner === owner && stopListening) return stopPersistence

  stopPersistence()
  const meta = await readMeta()
  if (meta && (meta.owner !== owner || meta.schema !== SCHEMA)) await clearAll()
  await writeMeta({ owner, schema: SCHEMA, buildId: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '' })
  currentOwner = owner

  const cache = queryClient.getQueryCache()
  for (const query of cache.getAll()) {
    if (shouldPersist(query.queryKey, query.state.status)) {
      void put(toEntry(query.queryHash, query.queryKey, query.state.data, query.state.dataUpdatedAt))
    }
  }
  stopListening = cache.subscribe((event) => {
    if (event.type !== 'updated') return
    const { query, action } = event
    if (action.type === 'success' && shouldPersist(query.queryKey, 'success')) {
      void put(toEntry(query.queryHash, query.queryKey, query.state.data, query.state.dataUpdatedAt))
    } else if (action.type === 'error' && isGoneError(action.error) && shouldPersist(query.queryKey, 'success')) {
      // The server no longer gives it to this session (FR-014).
      void forgetQuery(queryClient, query.queryKey)
    }
  })
  return stopPersistence
}

export function stopPersistence() {
  stopListening?.()
  stopListening = null
  currentOwner = null
}

export interface Snapshot {
  owner: string
  oldestUpdatedAt: number
}

/**
 * Put the phone's copy back into memory (at start, before the screens). Gone or stale copies are dropped; with nothing valid
 * left the base is cleared and the answer is `null` («Necesitas conexión»).
 */
export async function restoreSnapshot(queryClient: QueryClient, now: number = Date.now()): Promise<Snapshot | null> {
  if (!isInstalledPhone()) return null
  const meta = await readMeta()
  if (!meta || meta.schema !== SCHEMA) {
    await clearAll()
    return null
  }
  const entries = await readAll()
  const valid: StoredQuery[] = []
  for (const entry of entries) {
    if (isExpired(entry.dataUpdatedAt, now) || !shouldPersist(entry.queryKey, 'success')) await remove(entry.queryHash)
    else valid.push(entry)
  }
  if (valid.length === 0) {
    await clearAll()
    return null
  }
  for (const entry of valid) {
    const current = queryClient.getQueryState(entry.queryKey)
    if (!current || current.dataUpdatedAt < entry.dataUpdatedAt) {
      queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.dataUpdatedAt })
    }
  }
  return { owner: meta.owner, oldestUpdatedAt: Math.min(...valid.map((e) => e.dataUpdatedAt)) }
}

/** Drop the answers older than 7 days, on the phone and in memory (each hour while the app is open, FR-013). */
export async function pruneExpired(queryClient: QueryClient, now: number = Date.now()): Promise<void> {
  // Nothing was kept anywhere else: never open (and so create) the base on a computer.
  if (!isInstalledPhone()) return
  for (const entry of await readAll()) {
    if (isExpired(entry.dataUpdatedAt, now)) {
      queryClient.removeQueries({ queryKey: entry.queryKey, exact: true })
      await remove(entry.queryHash)
    }
  }
}

/** The subject (child id or `person:<id>`) a kept key is about, or null when the key doesn't name one. */
export function subjectOfKey(queryKey: readonly unknown[]): string | null {
  const [root, a, b] = queryKey
  switch (root) {
    case 'overview':
    case 'consultations':
    case 'vaccinations':
    case 'vaccine-photos':
      return typeof a === 'string' ? a : null
    case 'routines':
      if (a === 'personal') return typeof b === 'string' ? `person:${b}` : null
      return typeof a === 'string' ? a : null
    case 'appointments':
      return a === 'child' && typeof b === 'string' ? b : null
    default:
      return null
  }
}

/** Forget the answers of children and people the session no longer sees (`accounts/me` changed, FR-014). */
export async function pruneSubjects(queryClient: QueryClient, allowed: ReadonlySet<string>): Promise<void> {
  const gone = queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => {
      const subject = subjectOfKey(q.queryKey)
      return subject !== null && !allowed.has(subject)
    })
  for (const query of gone) await forgetQuery(queryClient, query.queryKey)
  if (!isInstalledPhone()) return
  for (const entry of await readAll()) {
    const subject = subjectOfKey(entry.queryKey)
    if (subject !== null && !allowed.has(subject)) await remove(entry.queryHash)
  }
}

/** The subjects an account sees: its children, itself and the people who share with it. */
export function allowedSubjects(account: { id: string; children: { id: string }[]; sharedProfiles?: { accountId: string }[] }): Set<string> {
  return new Set([
    ...account.children.map((c) => c.id),
    `person:${account.id}`,
    ...(account.sharedProfiles ?? []).map((p) => `person:${p.accountId}`),
  ])
}

/** Everything gone from this device: the phone's copy and the memory (logout, another user, a refused child access). */
export async function wipeOffline(queryClient: QueryClient): Promise<void> {
  queryClient.clear()
  await wipeOfflineCopy()
}

/** Only the phone's copy (the logout clears the memory itself, after signing out). */
export async function wipeOfflineCopy(): Promise<void> {
  stopPersistence()
  await clearAll()
}
