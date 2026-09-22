import { FormField as Field } from '../../shared/ui/FormField'
import type { SignupForm } from './useSignupForm'

const codeField =
  'min-h-11 w-full min-w-0 rounded-2xl border-[1.5px] border-slate-300 px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'

/**
 * The step between submitting the signup form and actually creating the
 * PediTrack account (specs/008-autenticacion-cuenta, Historia 1): Clerk
 * emailed a code to verify the address just entered, and this is the only
 * thing left standing between the tutor and `/home`. Not in either mock
 * (spec 007 didn't anticipate real authentication) — styled to match the
 * rest of the signup form (`design-tokens.md`) rather than invent a new look.
 */
export function EmailCodeStep({ form }: { form: SignupForm }) {
  const { code, setCode, onSubmitCode, isPending, serverError } = form

  return (
    <form onSubmit={onSubmitCode} noValidate className="flex w-full max-w-[520px] flex-col gap-6">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-ink">Verifica tu correo</h2>
        <p className="mt-2 text-base text-slate-600">
          Te enviamos un código a tu correo. Escríbelo aquí para terminar de crear tu cuenta.
        </p>
      </div>

      <Field id="email-code" text="Código de verificación">
        <input
          id="email-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          size={1}
          placeholder="123456"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className={codeField}
        />
      </Field>

      {serverError && (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 cursor-pointer rounded-2xl bg-confirmed py-4 text-base font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? 'Verificando…' : 'Verificar código'}
      </button>
    </form>
  )
}
