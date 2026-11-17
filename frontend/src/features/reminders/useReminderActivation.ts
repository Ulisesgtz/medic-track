import { useCallback, useRef, useState } from 'react'
import type { Account } from '../home/types'
import type { ReminderDetail } from './api'
import { REMINDER_CHILD_FALLBACK } from './reminderText'
import type { useReminders } from './useReminders'

/**
 * The name the «detailed» example of the reminders dialog shows: the account's first OWN child (the first of `children` can be one
 * shared with the person, which is not whose example this is), or a neutral fallback.
 */
export function reminderChildName(account: Account): string {
  return account.children.find((c) => !c.role || c.role === 'owner')?.firstName ?? REMINDER_CHILD_FALLBACK
}

/**
 * Turning the reminders on, or changing what they show, with the choice the account makes the first time (specs/011, FR-008):
 * the one flow the home's reminders card and the first-use guide (specs/071) share. `start` activates at once when the account
 * already chose and otherwise opens the dialog; `choose` and `cancel` are for the dialog (`ReminderDetailDialog`), which takes
 * `reminderChildName`, `account.reminderDetail` and the button it returns the focus to.
 */
export function useReminderActivation(account: Account | undefined, reminders: ReturnType<typeof useReminders>) {
  const [dialog, setDialog] = useState<'activate' | 'change' | null>(null)
  const activateButton = useRef<HTMLButtonElement>(null)
  const changeButton = useRef<HTMLButtonElement>(null)
  // Stable: the dialog re-runs its focus setup when its callbacks change identity.
  const cancel = useCallback(() => setDialog(null), [])

  function start() {
    // The first time for the account the person chooses what the reminders show before anything else.
    if (account?.reminderDetail === null) setDialog('activate')
    else void reminders.activate()
  }

  function startChange() {
    setDialog('change')
  }

  function choose(choice: ReminderDetail) {
    const mode = dialog
    setDialog(null)
    if (mode === 'change') void reminders.changeDetail(choice)
    else void reminders.activate(choice)
  }

  return { dialog, start, startChange, choose, cancel, activateButton, changeButton, childName: account ? reminderChildName(account) : REMINDER_CHILD_FALLBACK }
}
