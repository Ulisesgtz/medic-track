// The phone's copy of the answers the session already saw (specs/067, data-model.md): IndexedDB `peditrack-offline`, one entry per
// query plus a `__meta__` entry with whose they are. Every access is wrapped: a full, blocked or private storage means nothing is
// kept and the app behaves as before (online exactly as today; offline, «Necesitas conexión»).

export const DB_NAME = 'peditrack-offline'
const DB_VERSION = 1
const STORE = 'queries'
const META_KEY = '__meta__'
export const SCHEMA = 1

export interface StoredQuery {
  queryHash: string
  queryKey: readonly unknown[]
  data: unknown
  /** When the server sent it (ms): the base of the 7 days and of the banner's hour. */
  dataUpdatedAt: number
}

export interface StoredMeta {
  /** `user:<clerkUserId>` or `child:<childId>` — never an email, a name or a credential. */
  owner: string
  schema: number
  buildId: string
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let opening: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (opening) return opening
  opening = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        // Another tab deleting the base (a logout) closes this connection instead of blocking it.
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  }).then((db) => {
    if (!db) opening = null
    return db
  })
  return opening
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>, fallback: T): Promise<T> {
  try {
    const db = await open()
    if (!db) return fallback
    const tx = db.transaction(STORE, mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
      tx.onerror = () => reject(tx.error)
    })
    const result = await run(tx.objectStore(STORE))
    await done
    return result
  } catch {
    return fallback
  }
}

/** Every saved answer (not the meta). */
export function readAll(): Promise<StoredQuery[]> {
  return withStore(
    'readonly',
    async (store) => {
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
      return values.filter((_, i) => keys[i] !== META_KEY) as StoredQuery[]
    },
    [],
  )
}

export function put(entry: StoredQuery): Promise<boolean> {
  return withStore('readwrite', async (store) => {
    await request(store.put(entry, entry.queryHash))
    return true
  }, false)
}

export function remove(queryHash: string): Promise<boolean> {
  return withStore('readwrite', async (store) => {
    await request(store.delete(queryHash))
    return true
  }, false)
}

export function readMeta(): Promise<StoredMeta | null> {
  return withStore('readonly', async (store) => ((await request(store.get(META_KEY))) as StoredMeta | undefined) ?? null, null)
}

export function writeMeta(meta: StoredMeta): Promise<boolean> {
  return withStore('readwrite', async (store) => {
    await request(store.put(meta, META_KEY))
    return true
  }, false)
}

/**
 * Everything gone: the answers and whose they were — the whole base is deleted, so wiping on a device that never kept anything
 * (a computer, FR-012) doesn't create an empty one either.
 */
export async function clearAll(): Promise<boolean> {
  try {
    const db = await (opening ?? Promise.resolve(null))
    db?.close()
    opening = null
    return await new Promise<boolean>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
      // Another tab still has it open: it closes on `versionchange` and the deletion completes then.
      req.onblocked = () => resolve(true)
    })
  } catch {
    return false
  }
}

/** Whether the base exists on this device at all (the computer must never have it, FR-012). */
export async function databaseExists(): Promise<boolean> {
  try {
    const all = await indexedDB.databases?.()
    return (all ?? []).some((db) => db.name === DB_NAME)
  } catch {
    return false
  }
}

/** Tests only: forget the open connection. */
export function resetIdbConnection() {
  opening = null
}
