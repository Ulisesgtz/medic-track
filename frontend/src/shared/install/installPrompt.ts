import { useEffect, useState, useSyncExternalStore } from 'react'

// specs/071: the browser's «install» offer. `beforeinstallprompt` fires once, early, so the listener starts with the app
// (main.tsx) and keeps the event until a tap uses it or the app gets installed.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let started = false
let startedAt = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** Starts listening once; calling it again does nothing. */
export function startInstallPrompt(): void {
  if (started || typeof window === 'undefined') return
  started = true
  startedAt = Date.now()
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

/** How long after the app starts the browser may still send `beforeinstallprompt` (it fires early, but not at once). */
export const INSTALL_OFFER_MARGIN_MS = 3000

/** Whether this browser has the install offer at all (Chromium's): Firefox and Safari never send it, so there is nothing to wait for. */
export function supportsInstallPrompt(): boolean {
  return typeof window !== 'undefined' && 'onbeforeinstallprompt' in window
}

/** Milliseconds left in which the offer can still arrive: 0 when it is here, the browser has none, or the margin is over. */
export function installOfferWaitMs(): number {
  if (deferred || !started || !supportsInstallPrompt()) return 0
  return Math.max(0, startedAt + INSTALL_OFFER_MARGIN_MS - Date.now())
}

export function canInstall(): boolean {
  return deferred !== null
}

/** Shows the browser's own install dialog. The offer is spent either way: the browser fires a new event if it offers again. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  emit()
  try {
    await event.prompt()
    return (await event.userChoice).outcome
  } catch {
    return 'dismissed'
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Whether the install offer is available, kept up to date, and `waiting`: the browser supports it, it has not come and the margin
 * after the app started is not over, so a screen shouldn't conclude yet that this browser can't install.
 */
export function useInstallPrompt(): { canInstall: boolean; waiting: boolean; promptInstall: typeof promptInstall } {
  const can = useSyncExternalStore(subscribe, canInstall, () => false)
  const [waiting, setWaiting] = useState(() => installOfferWaitMs() > 0)
  useEffect(() => {
    const left = installOfferWaitMs()
    if (left <= 0) return
    const timer = setTimeout(() => setWaiting(false), left)
    return () => clearTimeout(timer)
  }, [])
  return { canInstall: can, waiting: waiting && !can, promptInstall }
}

/** For the tests: forgets the saved event and the listeners' started state. */
export function resetInstallPromptForTests(): void {
  deferred = null
  started = false
  startedAt = 0
  listeners.clear()
}
