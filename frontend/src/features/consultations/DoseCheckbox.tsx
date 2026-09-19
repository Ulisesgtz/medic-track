import { useState } from 'react'
import { useDoseToggle } from './useDoseToggle'
import type { Dose } from './types'

interface DoseCheckboxProps {
  consultationId: string
  dose: Dose
}

/**
 * One markable dose (FR-011), shown as a 44px chip: emerald when taken,
 * amber when the parent hasn't marked it, neutral when it's still in the
 * future. Color never carries a medical judgment (Principio I) — the state
 * is also written out as text. Can be toggled at any time, regardless of
 * whether its scheduled date already passed or the treatment already ended
 * (FR-016) — there is no "active treatment" concept anywhere in this UI.
 */
export function DoseCheckbox({ consultationId, dose }: DoseCheckboxProps) {
  const mutation = useDoseToggle(consultationId, dose.id)

  // Captured once at mount so render stays pure; "future" only tints the chip.
  const [mountedAt] = useState(() => Date.now())
  const isFuture = new Date(dose.scheduledAt).getTime() > mountedAt
  const chipClass = dose.taken
    ? 'border-confirmed bg-confirmed text-white'
    : isFuture
      ? 'border-slate-100 bg-slate-100 text-slate-600'
      : 'border-pending bg-pending-soft text-pending-strong'
  const stateText = dose.taken ? 'Tomada' : isFuture ? 'Próxima' : 'Sin marcar'

  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-action has-[:focus-visible]:ring-offset-2 ${chipClass} ${
        mutation.isPending ? 'opacity-60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={dose.taken}
        onChange={(e) => mutation.mutate(e.target.checked)}
        disabled={mutation.isPending}
        className="sr-only"
      />
      <span>{new Date(dose.scheduledAt).toLocaleString()}</span>
      <span className="text-xs font-extrabold tracking-[0.1em] uppercase">{stateText}</span>
    </label>
  )
}
