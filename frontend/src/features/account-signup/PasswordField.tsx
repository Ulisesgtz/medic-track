import { useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { FormField as Field } from '../../shared/ui/FormField'
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
  const [visible, setVisible] = useState(false)
  const showRules = focused || value.length > 0

  return (
    <Field id="password" text="Contraseña" error={error}>
      {/* Focus counts for the input and its eye button together, so tabbing between them keeps the rules on screen. */}
      <div
        className="relative"
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
      >
        <input
          id="password"
          type={visible ? 'text' : 'password'}
          size={1}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          aria-describedby={showRules ? 'password-rules' : undefined}
          className={`${inputClassName} pr-12!`}
          {...registration}
        />
        <button
          id="password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {visible ? (
              <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-0.4 1-1.2 2.4-2.5 3.6M6.3 6.3C4.3 7.7 2.9 9.9 2.5 12c1 2.8 4.5 7 9.5 7 1.5 0 2.9-0.4 4.1-1" />
            ) : (
              <>
                <path d="M2.5 12C3.5 9.2 7 5 12 5s8.5 4.2 9.5 7c-1 2.8-4.5 7-9.5 7s-8.5-4.2-9.5-7Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
      {showRules && <PasswordRules id="password-rules" value={value} />}
    </Field>
  )
}
