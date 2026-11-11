import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as device from './device'
import { readAll, readMeta, resetIdbConnection, writeMeta } from './idbStore'
import { OFFLINE_MAX_AGE_MS } from './persistPolicy'
import {
  allowedSubjects,
  forgetQuery,
  pruneExpired,
  pruneSubjects,
  restoreSnapshot,
  startPersistence,
  stopPersistence,
  subjectOfKey,
  wipeOffline,
} from './persistence'

const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

let client: QueryClient
let installed: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetIdbConnection()
  globalThis.indexedDB = new IDBFactory()
  client = new QueryClient()
  installed = vi.spyOn(device, 'isInstalledPhone').mockReturnValue(true)
})

afterEach(() => {
  stopPersistence()
  vi.restoreAllMocks()
})

describe('startPersistence', () => {
  it('keeps nothing anywhere but the installed phone', async () => {
    installed.mockReturnValue(false)
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'k1'], { id: 'k1' })
    await flush()
    expect(await readAll()).toEqual([])
    expect(await readMeta()).toBeNull()
  })

  it('keeps the allowed answers without the photo, with their owner', async () => {
    client.setQueryData(['accounts', 'me'], { id: 'a1', children: [] })
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'k1'], { id: 'k1', photoBase64: 'AAAA' })
    client.setQueryData(['cabinet-photo', 'i1'], 'data:image/png;base64,AAA')
    client.setQueryData(['history', 'c1'], [{ id: 'k1' }])
    await flush()
    const all = await readAll()
    expect(all.map((e) => e.queryKey[0]).sort()).toEqual(['accounts', 'consultation'])
    expect(all.find((e) => e.queryKey[0] === 'consultation')?.data).toEqual({ id: 'k1', photoBase64: '', photoOmitted: true })
    expect(await readMeta()).toMatchObject({ owner: 'user:u1', schema: 1 })
  })

  it('wipes another owner’s copy first', async () => {
    await writeMeta({ owner: 'user:other', schema: 1, buildId: 'x' })
    await startPersistence(client, 'user:u1')
    expect((await readMeta())?.owner).toBe('user:u1')
  })

  it('starts once per owner', async () => {
    const stop = await startPersistence(client, 'user:u1')
    expect(await startPersistence(client, 'user:u1')).toBe(stop)
  })

  it('forgets an answer the server no longer gives', async () => {
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'k1'], { id: 'k1' })
    await flush()
    expect(await readAll()).toHaveLength(1)
    await client
      .fetchQuery({ queryKey: ['consultation', 'k1'], queryFn: () => Promise.reject(Object.assign(new Error('gone'), { kind: 'consultation_not_found' })), retry: false })
      .catch(() => undefined)
    await flush()
    expect(await readAll()).toEqual([])
    expect(client.getQueryData(['consultation', 'k1'])).toBeUndefined()
  })

  it('keeps the copy when a request fails only for the network', async () => {
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'k1'], { id: 'k1' })
    await flush()
    await client.fetchQuery({ queryKey: ['consultation', 'k1'], queryFn: () => Promise.reject(new TypeError('Failed to fetch')), retry: false }).catch(() => undefined)
    await flush()
    expect(await readAll()).toHaveLength(1)
  })
})

describe('restoreSnapshot', () => {
  it('puts back the valid answers and drops the stale ones', async () => {
    const now = Date.now()
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'fresh'], { id: 'fresh' }, { updatedAt: now - 24 * 60 * 60 * 1000 })
    client.setQueryData(['consultation', 'stale'], { id: 'stale' }, { updatedAt: now - OFFLINE_MAX_AGE_MS - 1 })
    await flush()
    stopPersistence()

    const fresh = new QueryClient()
    const snapshot = await restoreSnapshot(fresh, now)
    expect(snapshot).toEqual({ owner: 'user:u1', oldestUpdatedAt: now - 24 * 60 * 60 * 1000 })
    expect(fresh.getQueryData(['consultation', 'fresh'])).toEqual({ id: 'fresh' })
    expect(fresh.getQueryData(['consultation', 'stale'])).toBeUndefined()
    expect((await readAll()).map((e) => e.queryKey[1])).toEqual(['fresh'])
  })

  it('answers null and clears when nothing valid is left', async () => {
    const now = Date.now()
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'stale'], { id: 'stale' }, { updatedAt: now - OFFLINE_MAX_AGE_MS - 1 })
    await flush()
    expect(await restoreSnapshot(new QueryClient(), now)).toBeNull()
    expect(await readMeta()).toBeNull()
  })

  it('answers null without a meta or with another schema', async () => {
    expect(await restoreSnapshot(client)).toBeNull()
    await writeMeta({ owner: 'user:u1', schema: 99, buildId: 'x' })
    expect(await restoreSnapshot(client)).toBeNull()
    expect(await readMeta()).toBeNull()
  })

  it('answers null anywhere but the installed phone', async () => {
    installed.mockReturnValue(false)
    expect(await restoreSnapshot(client)).toBeNull()
  })

  it('never overwrites a newer answer already in memory', async () => {
    const now = Date.now()
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'k1'], { v: 'old' }, { updatedAt: now - 1000 })
    await flush()
    stopPersistence()
    const live = new QueryClient()
    live.setQueryData(['consultation', 'k1'], { v: 'new' }, { updatedAt: now })
    await restoreSnapshot(live, now)
    expect(live.getQueryData(['consultation', 'k1'])).toEqual({ v: 'new' })
  })
})

describe('pruneExpired', () => {
  it('drops each answer after its own 7 days', async () => {
    const now = Date.now()
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'old'], { id: 'old' }, { updatedAt: now - 8 * 24 * 60 * 60 * 1000 })
    client.setQueryData(['consultation', 'new'], { id: 'new' }, { updatedAt: now - 24 * 60 * 60 * 1000 })
    await flush()
    await pruneExpired(client, now)
    expect((await readAll()).map((e) => e.queryKey[1])).toEqual(['new'])
    expect(client.getQueryData(['consultation', 'old'])).toBeUndefined()
  })
})

describe('subjects', () => {
  it('reads the subject of each kind of key', () => {
    expect(subjectOfKey(['overview', 'c1', 'x'])).toBe('c1')
    expect(subjectOfKey(['consultations', 'person:a1'])).toBe('person:a1')
    expect(subjectOfKey(['routines', 'personal', 'a1', 'supplement', 'x'])).toBe('person:a1')
    expect(subjectOfKey(['routines', 'c1', 'activity', 'x'])).toBe('c1')
    expect(subjectOfKey(['appointments', 'child', 'c1'])).toBe('c1')
    expect(subjectOfKey(['appointments', 'one', 'p1'])).toBeNull()
    expect(subjectOfKey(['consultation', 'k1'])).toBeNull()
    expect(subjectOfKey(['vaccinations', undefined])).toBeNull()
    expect(subjectOfKey(['routines', 'personal', undefined])).toBeNull()
  })

  it('lists the children, the person and who shares with them', () => {
    expect(allowedSubjects({ id: 'a1', children: [{ id: 'c1' }], sharedProfiles: [{ accountId: 'a2' }] })).toEqual(new Set(['c1', 'person:a1', 'person:a2']))
    expect(allowedSubjects({ id: 'a1', children: [] })).toEqual(new Set(['person:a1']))
  })

  it('forgets the children the session no longer sees', async () => {
    await startPersistence(client, 'user:u1')
    client.setQueryData(['overview', 'c1', 'x'], { doses: [] })
    client.setQueryData(['overview', 'gone', 'x'], { doses: [] })
    client.setQueryData(['consultation', 'k1'], { id: 'k1' })
    await flush()
    await pruneSubjects(client, new Set(['c1', 'person:a1']))
    expect((await readAll()).map((e) => JSON.stringify(e.queryKey)).sort()).toEqual(['["consultation","k1"]', '["overview","c1","x"]'])
    expect(client.getQueryData(['overview', 'gone', 'x'])).toBeUndefined()
  })
})

describe('forget and wipe', () => {
  it('forgets one answer in memory and on the phone', async () => {
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'k1'], { id: 'k1' })
    await flush()
    await forgetQuery(client, ['consultation', 'k1'])
    await forgetQuery(client, ['consultation', 'never'])
    expect(await readAll()).toEqual([])
  })

  it('leaves nothing on the device', async () => {
    await startPersistence(client, 'user:u1')
    client.setQueryData(['consultation', 'k1'], { id: 'k1' })
    await flush()
    await wipeOffline(client)
    expect(await readAll()).toEqual([])
    expect(await readMeta()).toBeNull()
    expect(client.getQueryCache().getAll()).toEqual([])
    client.setQueryData(['consultation', 'k2'], { id: 'k2' })
    await flush()
    expect(await readAll()).toEqual([])
  })
})
