import { useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

/**
 * A password `<input>` with the "eye" button that shows or hides what was
 * typed. Shared by the signup, the login and the password reset so all of
 * them behave (and read to a screen reader) the same way.
 */
export function PasswordInput({
  id,
  registration,
  className,
  autoComplete,
  placeholder = 'Mínimo 8 caracteres',
  describedBy,
}: {
  id: string
  registration: UseFormRegisterReturn
  className: string
  autoComplete: 'new-password' | 'current-password'
  placeholder?: string
  describedBy?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        size={1}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-describedby={describedBy}
        className={`${className} pr-12!`}
        {...registration}
      />
      <button
        id={`${id}-toggle`}
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
  )
}
