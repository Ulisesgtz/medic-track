// bugfix/061: what the person chose on THIS device, so an update of the app never turns their reminders off. The browser can lose
// its push subscription by itself (iOS takes it away after a push that showed nothing, and sometimes when the service worker is
// replaced), and the registration with the API can fail while it is being deployed; neither is the person turning reminders off.
// Kept in `localStorage` (one per device): the id of the account reminders were turned on for. Always in try/catch: private
// mode or blocked storage just means no memory, as before.

const KEY = 'recordatorios-activos'

/** The account reminders were turned on for here, or null if they were turned off or never on. */
export function remindersOnFor(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function rememberRemindersOn(accountId: string): void {
  try {
    localStorage.setItem(KEY, accountId)
  } catch {
    // No storage: the next visit decides from the subscription alone.
  }
}

/** Turned off here, or signed out: nothing is brought back by itself. */
export function forgetReminders(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}
