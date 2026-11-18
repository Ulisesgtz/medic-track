import type { ReactNode } from 'react'

/**
 * The selectable card of the mock (a real radio with its label: the keyboard and the screen reader understand it). The chosen
 * one has a 2 px ink border and a check inside the circle — never only a change of color.
 */
export function ChoiceCard({
  name,
  checked,
  onChange,
  compact = false,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  /** The data cards of C: 12/14 padding and no shadow. */
  compact?: boolean
  children: ReactNode
}) {
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-3.5 rounded-[22px] border-2 bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-action ${
        compact ? 'px-3.5 py-3' : 'p-4 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
      } ${checked ? 'border-ink' : 'border-hint-edge'}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="absolute h-px w-px opacity-0" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-ink bg-ink' : 'border-slate-400 bg-surface'}`}
      >
        {checked && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">{children}</span>
    </label>
  )
}
