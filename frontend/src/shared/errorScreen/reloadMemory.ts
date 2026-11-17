// specs/072: «Volver a cargar» is remembered in sessionStorage so a screen that breaks again right after says so (state E).
const KEY = 'peditrack.errorScreen.reloadedAt'
export const RECENT_RELOAD_MS = 30_000

export function rememberReload(now: number = Date.now()) {
  try {
    sessionStorage.setItem(KEY, String(now))
  } catch {
    // Private mode or no storage: the screen just never says «sigue sin cargar».
  }
}

export function reloadedRecently(now: number = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY))
    return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at <= RECENT_RELOAD_MS
  } catch {
    return false
  }
}

/**
 * Forgets the stamp. «Sigue sin cargar» (state E) is only for the FIRST screen after «Volver a cargar» breaking again, so the app
 * calls this as soon as its frames draw after a page load (`RenderErrorBoundary` mounting): a failure of another screen later is a
 * new failure, not a reload that did not work. The error screen reads the stamp while it renders, before the frames mount.
 */
export function forgetReload() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // No storage: there is nothing remembered either.
  }
}
