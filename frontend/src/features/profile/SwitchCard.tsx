import type { ReactNode } from 'react'

/**
 * A card with a title, a sentence and a switch (the look of «Tus avisos», specs/033): the switch has a fixed name and its state is
 * only `aria-checked`. Used by the switch to share one's own consultations and by a Tutor's reminders of a shared one (specs/058).
 */
export function SwitchCard({
  title,
  text,
  label,
  on,
  pending,
  onToggle,
  note,
  error,
}: {
  title: string
  text: string
  label: string
  on: boolean
  pending: boolean
  onToggle: () => void
  note?: ReactNode
  error?: string | null
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[17px] font-black tracking-[-0.01em] text-ink">{title}</h3>
          <p className="text-sm leading-normal text-body">{text}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          disabled={pending}
          onClick={onToggle}
          className="flex min-h-11 w-[60px] shrink-0 cursor-pointer items-center justify-center focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-action [&:focus-visible>span]:ring-offset-2"
        >
          <span aria-hidden="true" className={`relative h-8 w-[52px] rounded-full transition-colors duration-200 ${on ? 'bg-action' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-surface transition-all duration-200 ${on ? 'right-1' : 'left-1'}`} />
          </span>
        </button>
      </div>
      {note && <p className="text-[13px] leading-normal text-slate-600">{note}</p>}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-body">
          {error}
        </p>
      )}
    </section>
  )
}
