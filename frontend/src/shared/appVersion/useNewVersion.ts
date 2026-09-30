import { useEffect, useState } from 'react'

export const VERSION_CHECK_MS = 10 * 60 * 1000

/** The version the server publishes in `/version.json`, or null when there is no usable answer (offline, dev server). */
export async function fetchPublishedVersion(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const body: unknown = await response.json()
    const version = (body as { version?: unknown } | null)?.version
    return typeof version === 'string' && version !== '' ? version : null
  } catch {
    return null
  }
}

// Remembered for the whole session: every screen mounts its own AppShell, and going from one to another must not make
// the notice disappear and be asked for again.
let detected = false

/** For tests: forget that a new version was seen. */
export function resetNewVersion() {
  detected = false
}

/**
 * True once the published version differs from the one running (specs/017). Checked on mount, whenever the app comes
 * back to the foreground and every 10 minutes; it never goes back to false without a reload.
 */
export function useNewVersion(): boolean {
  const [hasNew, setHasNew] = useState(detected)

  useEffect(() => {
    if (hasNew) return
    let cancelled = false
    const check = async () => {
      const published = await fetchPublishedVersion()
      if (!cancelled && published !== null && published !== __APP_VERSION__) {
        detected = true
        setHasNew(true)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    void check()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => void check(), VERSION_CHECK_MS)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [hasNew])

  return hasNew
}
