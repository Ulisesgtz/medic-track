/**
 * "Solo registro" (specs/024): the neutral tag of a consultation saved only as a record — no schedule, no doses, no
 * reminders. Plain ink on the surface with a thin border: it says what the consultation is, never a state to act on
 * (no red, no amber). Used by the listing's card and by the detail, in both designs.
 */
export function RecordOnlyBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border-[1.5px] border-slate-300 bg-surface px-2.5 py-0.5 text-xs font-extrabold text-ink-soft ${className}`}
    >
      Solo registro
    </span>
  )
}
