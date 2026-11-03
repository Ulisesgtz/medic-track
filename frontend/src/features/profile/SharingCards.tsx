import { useState } from 'react'
import { SharingError } from '../consultations/api'
import { useConsultationSharing, useOwnReminders } from './hooks'
import { PROFILE } from './profileText'
import { SwitchCard } from './SwitchCard'

/**
 * «Compartir mis consultas con los Tutores de mi familia» (specs/058, research R5): off until the person turns it on; turning it
 * on needs a family with somebody else on the paid plan (the server says which is missing), turning it off works always. Only
 * the person's own profile shows it, and only when they belong to a family.
 */
export function SharingCard({ accountId, shared }: { accountId: string; shared: boolean }) {
  const sharing = useConsultationSharing(accountId)
  const [error, setError] = useState<string | null>(null)
  const toggle = () => {
    setError(null)
    sharing.mutate(!shared, {
      onError: (e) =>
        setError(e instanceof SharingError && e.reason === 'no_family' ? PROFILE.shareNoFamily : e instanceof SharingError && e.reason === 'plan' ? PROFILE.sharePlan : PROFILE.shareFailed),
    })
  }
  return (
    <SwitchCard
      title={PROFILE.shareTitle}
      text={shared ? PROFILE.shareOn : PROFILE.shareOff}
      label={PROFILE.shareLabel}
      on={shared}
      pending={sharing.isPending}
      onToggle={toggle}
      error={error}
    />
  )
}

/** A Tutor's own reminders of somebody's consultation shared with them: off until they turn them on (specs/058, research R7). */
export function OwnRemindersCard({ consultationId, on }: { consultationId: string; on: boolean }) {
  const reminders = useOwnReminders(consultationId)
  const [failed, setFailed] = useState(false)
  return (
    <SwitchCard
      title={PROFILE.remindersTitle}
      text={PROFILE.remindersText}
      label={PROFILE.remindersLabel}
      on={on}
      pending={reminders.isPending}
      onToggle={() => {
        setFailed(false)
        reminders.mutate(!on, { onError: () => setFailed(true) })
      }}
      note={PROFILE.remindersNote}
      error={failed ? PROFILE.remindersFailed : null}
    />
  )
}
