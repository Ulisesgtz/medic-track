import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAll, databaseExists, put, readAll, readMeta, remove, resetIdbConnection, writeMeta } from './idbStore'

beforeEach(() => {
  resetIdbConnection()
  globalThis.indexedDB = new IDBFactory()
})

const entry = (hash: string, at = 1) => ({ queryHash: hash, queryKey: ['consultation', hash], data: { id: hash }, dataUpdatedAt: at })

describe('idbStore', () => {
  it('keeps one entry per query and the meta apart', async () => {
    expect(await put(entry('a'))).toBe(true)
    await put(entry('b'))
    await put(entry('a', 2))
    await writeMeta({ owner: 'user:u1', schema: 1, buildId: 'x' })
    const all = await readAll()
    expect(all.map((e) => e.queryHash).sort()).toEqual(['a', 'b'])
    expect(all.find((e) => e.queryHash === 'a')?.dataUpdatedAt).toBe(2)
    expect(await readMeta()).toEqual({ owner: 'user:u1', schema: 1, buildId: 'x' })
  })

  it('removes one entry and clears everything', async () => {
    await put(entry('a'))
    await put(entry('b'))
    await writeMeta({ owner: 'user:u1', schema: 1, buildId: 'x' })
    await remove('a')
    expect((await readAll()).map((e) => e.queryHash)).toEqual(['b'])
    await clearAll()
    expect(await readAll()).toEqual([])
    expect(await readMeta()).toBeNull()
  })

  it('says whether the base exists', async () => {
    expect(await databaseExists()).toBe(false)
    await readMeta()
    expect(await databaseExists()).toBe(true)
  })

  it('keeps nothing when the storage cannot be opened', async () => {
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(await put(entry('a'))).toBe(false)
    expect(await readAll()).toEqual([])
    expect(await readMeta()).toBeNull()
    expect(await remove('a')).toBe(false)
    expect(await writeMeta({ owner: 'user:u1', schema: 1, buildId: 'x' })).toBe(false)
    vi.restoreAllMocks()
  })

  it('clearing deletes the whole base, and creates none where there was none', async () => {
    expect(await clearAll()).toBe(true)
    expect(await databaseExists()).toBe(false)
    await put(entry('a'))
    expect(await databaseExists()).toBe(true)
    expect(await clearAll()).toBe(true)
    expect(await databaseExists()).toBe(false)
  })

  it('clearing answers false when the browser refuses', async () => {
    vi.spyOn(globalThis.indexedDB, 'deleteDatabase').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(await clearAll()).toBe(false)
    vi.restoreAllMocks()
  })

  it('answers false when the browser cannot list its bases', async () => {
    vi.spyOn(globalThis.indexedDB, 'databases').mockRejectedValue(new Error('no'))
    expect(await databaseExists()).toBe(false)
    vi.restoreAllMocks()
  })
})
