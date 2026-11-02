import { PHONE } from '../childText'
import { useChildReminders } from './useChildReminders'

const outline =
  'min-h-11 cursor-pointer self-start rounded-[14px] border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

/** «Avisos» of the child's own screen: turn the phone's reminders on or off. A help, never a guaranteed alarm. */
export function RemindersCard({ credential }: { credential: string }) {
  const { state, busy, error, activate, deactivate } = useChildReminders(credential)
  if (state === 'loading') return null
  const text = PHONE.reminders
  const sentence: Record<string, string> = {
    unsupported: text.unsupported,
    'ios-needs-install': text.iosInstall,
    denied: text.denied,
    unavailable: text.unavailable,
    off: text.off,
    on: text.on,
  }
  return (
    <section aria-label={text.title} className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-hint-border bg-hint p-4">
      <h2 className="text-base font-extrabold text-ink">{text.title}</h2>
      <p className="text-sm leading-[1.45] text-body">{sentence[state]}</p>
      {(state === 'off' || state === 'on') && <p className="text-[13px] leading-relaxed text-body">{text.help}</p>}
      {state === 'off' && (
        <button type="button" className={outline} disabled={busy} onClick={() => void activate()}>
          {text.activate}
        </button>
      )}
      {state === 'on' && (
        <button type="button" className={outline} disabled={busy} onClick={() => void deactivate()}>
          {text.turnOff}
        </button>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {text.error}
        </p>
      )}
    </section>
  )
}
