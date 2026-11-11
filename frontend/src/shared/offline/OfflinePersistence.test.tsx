import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import * as device from './device'
import { readAll, readMeta, resetIdbConnection } from './idbStore'
import { OfflinePersistence } from './OfflinePersistence'
import { PRUNE_EVERY_MS, stopPersistence } from './persistence'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))

const flush = () => new Promise((resolve) => setTimeout(resolve, 30))

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <OfflinePersistence />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetIdbConnection()
  globalThis.indexedDB = new IDBFactory()
  vi.spyOn(device, 'isInstalledPhone').mockReturnValue(true)
})
afterEach(() => {
  stopPersistence()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('OfflinePersistence', () => {
  it('keeps nothing until Clerk confirms who it is', async () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null } as unknown as ReturnType<typeof useAuth>)
    const client = new QueryClient()
    mount(client)
    client.setQueryData(['consultation', 'k1'], { id: 'k1' })
    await flush()
    expect(await readMeta()).toBeNull()
  })

  it('keeps the signed-in user’s answers and forgets the children the account no longer has', async () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, userId: 'u1' } as unknown as ReturnType<typeof useAuth>)
    const client = new QueryClient()
    const { unmount } = mount(client)
    await flush()
    client.setQueryData(['overview', 'c1', 'x'], { doses: [] })
    client.setQueryData(['overview', 'c2', 'x'], { doses: [] })
    await flush()
    expect((await readMeta())?.owner).toBe('user:u1')
    client.setQueryData(['accounts', 'me'], { id: 'a1', children: [{ id: 'c1' }] })
    await flush()
    expect((await readAll()).map((e) => JSON.stringify(e.queryKey)).sort()).toEqual(['["accounts","me"]', '["overview","c1","x"]'])
    unmount()
  })

  it('drops the answers older than 7 days every hour', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, userId: 'u1' } as unknown as ReturnType<typeof useAuth>)
    const client = new QueryClient()
    mount(client)
    await flush()
    client.setQueryData(['consultation', 'old'], { id: 'old' }, { updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })
    await flush()
    expect(await readAll()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(PRUNE_EVERY_MS)
    await flush()
    expect(await readAll()).toEqual([])
  })
})
