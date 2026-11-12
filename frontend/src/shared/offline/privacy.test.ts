import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as device from './device'
import { databaseExists, readAll, readMeta, resetIdbConnection } from './idbStore'
import { PERSISTED_ROOTS } from './persistPolicy'
import { startPersistence, stopPersistence } from './persistence'

// specs/067, FR-009/FR-010/FR-012: what reaches the phone's storage, looked at from the storage itself after real-looking answers.

const flush = () => new Promise((resolve) => setTimeout(resolve, 30))
const IMAGE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/'

function seed(client: QueryClient) {
  client.setQueryData(['accounts', 'me'], { id: 'a1', firstName: 'Ana', email: 'ana@example.com', children: [{ id: 'c1', firstName: 'Mateo' }] })
  client.setQueryData(['consultation', 'k1'], { id: 'k1', doctorName: 'Dra. Cázares', photoBase64: IMAGE, medications: [{ name: 'Amoxicilina', doses: [] }] })
  client.setQueryData(['cabinet-item', 'i1'], { id: 'i1', name: 'Paracetamol', hasPhoto: true })
  client.setQueryData(['cabinet-photo', 'i1'], { photoBase64: IMAGE })
  client.setQueryData(['vaccine-photos', 'c1'], { photos: [{ id: 'p1', createdAt: '2026-10-01' }] })
  client.setQueryData(['vaccine-photos', 'c1', 'p1'], { photoBase64: IMAGE })
  client.setQueryData(['history', 'c1', { text: 'fiebre' }], [{ id: 'k1' }])
  client.setQueryData(['growth-chart', 'c1'], { curves: [] })
}

beforeEach(() => {
  resetIdbConnection()
  globalThis.indexedDB = new IDBFactory()
})
afterEach(() => {
  stopPersistence()
  vi.restoreAllMocks()
})

describe('what the phone keeps', () => {
  it('no photo, no key outside the allow list, no person in the meta', async () => {
    vi.spyOn(device, 'isInstalledPhone').mockReturnValue(true)
    const client = new QueryClient()
    await startPersistence(client, 'user:user_2abc')
    seed(client)
    await flush()

    const all = await readAll()
    const dump = JSON.stringify(all)
    expect(dump).not.toContain('data:image')
    expect(dump).not.toContain(IMAGE)
    expect(all.every((e) => PERSISTED_ROOTS.has(String(e.queryKey[0])))).toBe(true)
    expect(all.some((e) => e.queryKey[0] === 'vaccine-photos' && e.queryKey.length > 2)).toBe(false)
    expect(all.map((e) => e.queryKey[0]).sort()).toEqual(['accounts', 'cabinet-item', 'consultation', 'vaccine-photos'])

    const meta = JSON.stringify(await readMeta())
    expect(meta).not.toContain('ana@example.com')
    expect(meta).not.toContain('Ana')
    expect(meta).toContain('user:user_2abc')
  })

  it('nothing at all on a computer: the base is never created', async () => {
    vi.spyOn(device, 'isInstalledPhone').mockReturnValue(false)
    const client = new QueryClient()
    await startPersistence(client, 'user:user_2abc')
    seed(client)
    await flush()
    expect(await databaseExists()).toBe(false)
  })
})
