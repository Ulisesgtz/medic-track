const STORAGE_KEY = 'peditrack.accountId'

/**
 * Reads/writes the active account id saved in the browser (the only
 * "session" this app has — no real login yet, see spec.md's Supuestos).
 * Every localStorage access is wrapped in try/catch so a restrictive
 * private-browsing mode degrades to "not persisted" instead of breaking
 * navigation (Caso Límite de spec.md).
 */
export function useAccountSession() {
  function getAccountId(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  }

  function setAccountId(accountId: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, accountId)
    } catch {
      // localStorage unavailable (e.g. restrictive private mode) — the
      // caller's in-memory state still works for the rest of this tab
      // session, it just won't persist across reloads.
    }
  }

  function clearAccountId(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to clean up if localStorage was never reachable.
    }
  }

  return { getAccountId, setAccountId, clearAccountId }
}
