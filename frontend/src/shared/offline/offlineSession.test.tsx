import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { RequireSession } from '../../features/auth/RequireSession'
import { reloadApp } from '../appVersion/reload'
import { markUnsaved } from '../appVersion/unsavedWork'
import * as device from './device'
import { isOffline, resetConnectivity } from './connectivity'
import { resetIdbConnection, writeMeta, put } from './idbStore'
import { OfflineGate } from './OfflineGate'
import {
  bootOffline,
  CLERK_WAIT_MS,
  currentSnapshot,
  decideMode,
  forgetSnapshot,
  RECONNECT_EVERY_MS,
  resetOfflineSession,
  useOfflineSession,
} from './offlineSession'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn() }))
vi.mock('../appVersion/reload', () => ({ reloadApp: vi.fn() }))

const auth = (isLoaded: boolean, isSignedIn: boolean) =>
  vi.mocked(useAuth).mockReturnValue({ isLoaded, isSignedIn } as unknown as ReturnType<typeof useAuth>)

function setOnline(on: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: on, configurable: true })
}

const copy = { owner: 'user:u1', oldestUpdatedAt: 1 }

beforeEach(() => {
  resetConnectivity()
  resetOfflineSession()
  setOnline(true)
  vi.mocked(reloadApp).mockClear()
})
afterEach(() => {
  setOnline(true)
  resetConnectivity()
  resetOfflineSession()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('decideMode', () => {
  const base = { isLoaded: false, isSignedIn: false, noNetwork: false, waitedTooLong: false, snapshot: null }

  it('follows Clerk when it answers', () => {
    expect(decideMode({ ...base, isLoaded: true, isSignedIn: true, noNetwork: true, snapshot: copy })).toBe('clerk')
    expect(decideMode({ ...base, isLoaded: true })).toBe('clerk')
    expect(decideMode(base)).toBe('loading')
  })

  it('shows the copy when Clerk can’t reach its server', () => {
    expect(decideMode({ ...base, noNetwork: true, snapshot: copy })).toBe('offline')
    expect(decideMode({ ...base, waitedTooLong: true, snapshot: copy })).toBe('offline')
    // Clerk loaded without its server (no session confirmed): the copy, not the login.
    expect(decideMode({ ...base, isLoaded: true, noNetwork: true, snapshot: copy })).toBe('offline')
  })

  it('needs a connection with no copy, and waits while the copy is read', () => {
    expect(decideMode({ ...base, noNetwork: true })).toBe('gate')
    expect(decideMode({ ...base, noNetwork: true, snapshot: undefined })).toBe('loading')
  })

  it('never shows a child’s copy on the parents’ screens', () => {
    expect(decideMode({ ...base, noNetwork: true, snapshot: { owner: 'child:c1', oldestUpdatedAt: 1 } })).toBe('gate')
  })
})

describe('bootOffline', () => {
  it('reads the phone’s copy once', async () => {
    resetIdbConnection()
    globalThis.indexedDB = new IDBFactory()
    vi.spyOn(device, 'isInstalledPhone').mockReturnValue(true)
    await writeMeta({ owner: 'user:u1', schema: 1, buildId: 'x' })
    await put({ queryHash: '["accounts","me"]', queryKey: ['accounts', 'me'], data: { id: 'a1' }, dataUpdatedAt: Date.now() })
    const client = new QueryClient()
    const found = await bootOffline(client)
    expect(found?.owner).toBe('user:u1')
    expect(await bootOffline(client)).toBe(found)
    expect(currentSnapshot()).toBe(found)
    expect(client.getQueryData(['accounts', 'me'])).toEqual({ id: 'a1' })
    forgetSnapshot()
    expect(currentSnapshot()).toBeNull()
  })

  it('answers nothing when reading fails', async () => {
    vi.spyOn(device, 'isInstalledPhone').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(await bootOffline(new QueryClient())).toBeNull()
  })
})

describe('useOfflineSession', () => {
  it('opens the copy after waiting for Clerk, and tells the connectivity', () => {
    vi.useFakeTimers()
    resetOfflineSession(copy)
    auth(false, false)
    const { result } = renderHook(() => useOfflineSession())
    expect(result.current).toBe('loading')
    act(() => vi.advanceTimersByTime(CLERK_WAIT_MS))
    expect(result.current).toBe('offline')
    expect(isOffline()).toBe(true)
  })

  it('follows the browser’s network events', () => {
    resetOfflineSession(copy)
    auth(false, false)
    const { result } = renderHook(() => useOfflineSession())
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe('offline')
  })

  it('loads the app again when the network is back, unless a form holds work', async () => {
    vi.useFakeTimers()
    resetOfflineSession(copy)
    setOnline(false)
    auth(false, false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')))
    renderHook(() => useOfflineSession())
    const release = markUnsaved()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_EVERY_MS)
    })
    expect(reloadApp).not.toHaveBeenCalled()
    release()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_EVERY_MS)
    })
    expect(reloadApp).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('keeps waiting while the network is still down', async () => {
    vi.useFakeTimers()
    resetOfflineSession(copy)
    setOnline(false)
    auth(false, false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderHook(() => useOfflineSession())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_EVERY_MS)
    })
    expect(reloadApp).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('RequireSession without a network (specs/067)', () => {
  function renderGuarded() {
    return render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <RequireSession>
                <p>Protected content</p>
              </RequireSession>
            }
          />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('shows the phone’s copy', () => {
    resetOfflineSession(copy)
    setOnline(false)
    auth(false, false)
    renderGuarded()
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('says it needs a connection without a copy, never the login', () => {
    resetOfflineSession(null)
    setOnline(false)
    auth(false, false)
    renderGuarded()
    expect(screen.getByRole('heading', { name: 'Necesitas conexión para abrir PediTrack' })).toBeInTheDocument()
    expect(screen.queryByText('Login page')).toBeNull()
  })
})

describe('OfflineGate', () => {
  it('tells the phone and the computer apart, and tries again', async () => {
    vi.spyOn(device, 'isInstalledPhone').mockReturnValue(true)
    const { unmount } = render(<OfflineGate />)
    expect(screen.getByText(/quedará disponible en este teléfono por 7 días/)).toBeInTheDocument()
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(reloadApp).toHaveBeenCalled()
    unmount()
    vi.spyOn(device, 'isInstalledPhone').mockReturnValue(false)
    render(<OfflineGate />)
    expect(screen.getByText('Cuando tengas conexión, vuelve a abrir esta página.')).toBeInTheDocument()
  })
})
