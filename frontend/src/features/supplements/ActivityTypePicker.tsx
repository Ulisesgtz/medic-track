import { useId, type ReactNode } from 'react'
import { useActivityTypes } from '../../shared/catalog/useCatalog'
import { Notice } from '../../shared/ui/Notice'
import { ACTIVITY_TYPE_TEXT } from './activityTypeText'
import { offeredTypes } from './groupByActivityType'
import { selectedFill } from '../../shared/ui/selection'

const chip =
  'relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[15px] leading-[normal] font-extrabold transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-action has-[:focus-visible]:ring-offset-2'
const chipOff = 'border-hint-border bg-surface text-action hover:bg-hint'
const chipOn = selectedFill

interface ActivityTypePickerProps {
  /** The chosen type's code; empty while none is picked. */
  value: string
  onChange: (code: string) => void
  /** The group's title: the form's «Tipo de actividad · Obligatorio» or the dialog's «Elige un tipo · Actual: Deportiva». */
  legend: ReactNode
  /** The line under the title that says what it is for (the form's); the dialog has none. */
  hint?: string
  /** The sentence under the chips when the choice is missing: the group then goes inside a 2 px ink border (no red: mock C2). */
  error?: string
}

/**
 * The type choice as single-choice pills (mock C, C2 and D1; the same ones as the child's record): the catalog's active types, one
 * chosen at most and **none chosen from the start** — nothing is suggested, the parent decides (Principio I). Real radio buttons
 * (arrow keys move the choice) hidden under a label; the chosen pill is filled with ink and carries a check, so it doesn't rely on
 * color alone. If the catalog can't load it says so with a neutral notice. The same pills in the phone and the web designs.
 */
export function ActivityTypePicker({ value, onChange, legend, hint, error }: ActivityTypePickerProps) {
  const { data: catalog, isPending, isError } = useActivityTypes()
  const id = useId()
  const types = Array.isArray(catalog) ? offeredTypes(catalog, value) : []

  return (
    <fieldset
      className={`m-0 flex min-w-0 flex-col ${hint ? 'gap-2.5' : 'gap-2'} rounded-2xl p-0 ${error ? 'border-2 border-solid border-ink px-3.5 py-3' : 'border-0'}`}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className={`text-[13px] leading-[normal] font-bold text-ink ${error ? 'px-1.5' : 'p-0'} ${hint ? '' : 'mb-2'}`}>{legend}</legend>
      {hint && <span className="text-sm leading-[normal] text-body">{hint}</span>}
      {isPending && <p className="text-[13px] font-semibold text-slate-600">{ACTIVITY_TYPE_TEXT.loading}</p>}
      {isError && <Notice tone="info">{ACTIVITY_TYPE_TEXT.catalogFailed}</Notice>}
      {Array.isArray(catalog) && (
        <div className="flex flex-wrap gap-2">
          {types.map((type) => {
            const on = type.code === value
            return (
              <label key={type.code} className={`${chip} ${on ? chipOn : chipOff}`}>
                <input
                  type="radio"
                  name={`${id}-type`}
                  value={type.code}
                  checked={on}
                  onChange={() => onChange(type.code)}
                  className="absolute size-px opacity-0"
                />
                {type.name}
                {on && (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </label>
            )
          })}
        </div>
      )}
      {error && (
        <span id={`${id}-error`} role="alert" className="text-[15px] leading-[normal] font-extrabold text-ink">
          {error}
        </span>
      )}
    </fieldset>
  )
}
