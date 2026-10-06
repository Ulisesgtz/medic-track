// The invitation a person opened before they had a session: kept in `sessionStorage` (this tab only, gone when it
// closes) so that after logging in or signing up the home can take them back to it. Every access is in try/catch:
// storage can be blocked or throw (private windows) and the flow must still work, just without the way back.

const KEY = 'invitacion-pendiente'

export function savePendingInvitation(token: string): void {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // No way back after logging in; the person opens the link again.
  }
}

export function readPendingInvitation(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingInvitation(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The token in the `#` of the link (a browser never sends it to a server), without the `#`. */
export function tokenFromHash(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash
}
