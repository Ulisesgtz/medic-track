import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@clerk/react'
import type { QueryClient } from '@tanstack/react-query'
import { hasUnsavedWork } from '../appVersion/unsavedWork'
import { reloadApp } from '../appVersion/reload'
import { setOfflineSession } from './connectivity'
import { restoreSnapshot, type Snapshot } from './persistence'

// Opening without Clerk (specs/067, research R4). Without a network Clerk can't confirm the session and never gets ready, and the
// app used to stay on «Cargando…». When Clerk isn't there (no network, or 4 s waiting) and the installed phone has a valid copy of
// its last owner, the screens show that copy without asking for a token: `offline`. With no copy (or on a computer), `gate`:
// «Necesitas conexión para abrir PediTrack». Nobody signs in without a network and no data show without a session the phone had.

export const CLERK_WAIT_MS = 4000
export const RECONNECT_EVERY_MS = 10_000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** `undefined` while the phone's copy is being read; then the copy, or `null` when there is none. */
let snapshot: Snapshot | null | undefined = undefined
let booting: Promise<Snapshot | null> | null = null
const listeners = new Set<() => void>()

function setSnapshot(next: Snapshot | null) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

/** Read the phone's copy once, at start, before the screens ask for anything. */
export function bootOffline(queryClient: QueryClient): Promise<Snapshot | null> {
  booting ??= restoreSnapshot(queryClient).then(
    (found) => {
      setSnapshot(found)
      return found
    },
    () => {
      setSnapshot(null)
      return null
    },
  )
  return booting
}

/** The copy was wiped (logout, another user): nothing to open without a network any more. */
export function forgetSnapshot() {
  setSnapshot(null)
}

export function currentSnapshot(): Snapshot | null | undefined {
  return snapshot
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function browserOffline(): boolean {
  try {
    return navigator.onLine === false
  } catch {
    return false
  }
}

export type OfflineMode = 'clerk' | 'offline' | 'gate' | 'loading'

/** Decides what a guarded screen shows (pure, so every case is tested). */
export function decideMode(input: {
  isLoaded: boolean
  isSignedIn: boolean
  noNetwork: boolean
  waitedTooLong: boolean
  snapshot: Snapshot | null | undefined
}): OfflineMode {
  const { isLoaded, isSignedIn, noNetwork, waitedTooLong, snapshot: copy } = input
  if (isLoaded && isSignedIn) return 'clerk'
  // Clerk can't reach its server: without a network, or still loading after the wait.
  const clerkUnreachable = noNetwork || (!isLoaded && waitedTooLong)
  if (clerkUnreachable) {
    if (copy === undefined) return 'loading'
    if (copy && copy.owner.startsWith('user:')) return 'offline'
    if (!isLoaded) return 'gate'
  }
  return isLoaded ? 'clerk' : 'loading'
}

/** The mode of the parents' guarded screens, and the side effects of being in it. */
export function useOfflineSession(): OfflineMode {
  const { isLoaded, isSignedIn } = useAuth()
  const copy = useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
  const [waitedTooLong, setWaitedTooLong] = useState(false)
  const [noNetwork, setNoNetwork] = useState(browserOffline)

  useEffect(() => {
    if (isLoaded) return
    const timer = setTimeout(() => setWaitedTooLong(true), CLERK_WAIT_MS)
    return () => clearTimeout(timer)
  }, [isLoaded])

  useEffect(() => {
    const update = () => setNoNetwork(browserOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const mode = decideMode({ isLoaded, isSignedIn: isSignedIn === true, noNetwork, waitedTooLong, snapshot: copy })

  useEffect(() => {
    setOfflineSession(mode === 'offline')
  }, [mode])

  // Showing the copy and the network is back: Clerk didn't load, so the app loads again — unless a form holds something typed.
  useEffect(() => {
    if (mode !== 'offline' || isLoaded) return
    const tryAgain = async () => {
      try {
        await fetch(`${API_BASE_URL}/catalog/countries`, { cache: 'no-store' })
        if (!hasUnsavedWork()) reloadApp()
      } catch {
        // Still no network.
      }
    }
    const timer = setInterval(() => void tryAgain(), RECONNECT_EVERY_MS)
    window.addEventListener('online', tryAgain)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', tryAgain)
    }
  }, [mode, isLoaded])

  return mode
}

/** Tests only. */
export function resetOfflineSession(next: Snapshot | null | undefined = undefined) {
  booting = null
  snapshot = next
}
