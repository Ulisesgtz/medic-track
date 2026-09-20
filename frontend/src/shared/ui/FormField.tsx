import type { ReactNode } from 'react'

/** A labelled field with its inline error (`role="alert"`), as in the mockups' forms. */
export function FormField({
  id,
  text,
  error,
  children,
}: {
  id: string
  text: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-bold text-ink-soft">
        {text}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
