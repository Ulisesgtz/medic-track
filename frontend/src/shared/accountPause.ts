// specs/070: an account scheduled for deletion gets 409 `account_deletion_pending` on every route but a few. When a screen that
// was already open asks something and gets it, the app reads the account again and shows the paused screen.

/** The event the tracked fetch fires when the API says the session's account is paused. */
export const ACCOUNT_PAUSED_EVENT = 'peditrack:account-paused'

/** Looks at a 409 (a clone of the response: the caller still reads its own body) and fires the event if it is the pause. */
export async function noticeAccountPause(response: Response): Promise<void> {
  if (response.status !== 409) return
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error === 'account_deletion_pending')
      window.dispatchEvent(new Event(ACCOUNT_PAUSED_EVENT))
  } catch {
    // Not JSON: not the pause.
  }
}
