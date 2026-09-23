import { useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { FormField as Field } from '../../shared/ui/FormField'
import { PasswordInput } from '../../shared/ui/PasswordInput'
import { PASSWORD_RULES } from './validation'

function PasswordRules({ id, value }: { id: string; value: string }) {
  return (
    <div id={id} className="rounded-xl border border-hint-border bg-hint px-4 py-3">
      <p className="text-xs font-extrabold tracking-wide text-ink-soft uppercase">Reglas de la contraseña</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(value)
          return (
            <li key={rule.id} className={`flex items-start gap-2 text-[13px] font-semibold ${met ? 'text-confirmed-strong' : 'text-slate-600'}`}>
              <span
                aria-hidden="true"
                className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                  met ? 'border-confirmed bg-confirmed text-white' : 'border-slate-300 bg-surface'
                }`}
              >
                {met && (
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
              <span>
                {rule.label}
                <span className="sr-only">{met ? ' (cumplida)' : ' (pendiente)'}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * "Contraseña" field of both signup designs: the input plus, from the moment
 * the tutor focuses it or starts typing, the live checklist of the password
 * rules (Clerk's policy), so what's missing is visible before submitting.
 */
export function PasswordField({
  registration,
  value,
  error,
  inputClassName,
}: {
  registration: UseFormRegisterReturn
  value: string
  error?: string
  inputClassName: string
}) {
  const [focused, setFocused] = useState(false)
  const showRules = focused || value.length > 0

  return (
    <Field id="password" text="Contraseña" error={error}>
      {/* Focus counts for the input and its eye button together, so tabbing between them keeps the rules on screen. */}
      <div
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
      >
        <PasswordInput
          id="password"
          registration={registration}
          className={inputClassName}
          autoComplete="new-password"
          describedBy={showRules ? 'password-rules' : undefined}
        />
      </div>
      {showRules && <PasswordRules id="password-rules" value={value} />}
    </Field>
  )
}
