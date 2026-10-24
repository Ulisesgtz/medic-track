// The child's phone keeps ONE thing: its credential (specs/047). It lives in this browser's own storage under its own key, apart from
// anything a parent's session uses, so a parent signed in on the same phone is never mixed with the child. Every access is wrapped:
// the storage can be missing, full or blocked (a private window, cleared site data), and then the phone simply has no access.

const KEY = 'hijo-credencial'

export function readCredential(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeCredential(credential: string): boolean {
  try {
    window.localStorage.setItem(KEY, credential)
    return true
  } catch {
    return false
  }
}

export function clearCredential(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear if the storage can't be reached.
  }
}
