import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { GoogleSignupButton } from '../account-signup/GoogleSignupButton'
import { EMAIL_MESSAGE, emailValidation } from '../account-signup/validation'
import { FormField as Field } from '../../shared/ui/FormField'
import { Notice } from '../../shared/ui/Notice'
import { PasswordInput } from '../../shared/ui/PasswordInput'
import { AuthLayout } from './AuthLayout'
import { useLoginForm } from './useLoginForm'

const field =
  'min-h-11 w-full min-w-0 rounded-2xl border-[1.5px] px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const border = (invalid: boolean) => (invalid ? 'border-red-600' : 'border-slate-300')

const solidButton =
  'min-h-11 cursor-pointer rounded-2xl bg-confirmed py-4 text-base font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * `/login` (specs/008-autenticacion-cuenta, Historia 2): correo + contraseña
 * or Google, with a way to recover the password and a way to the signup. A
 * tutor who already has a session never sees it (they go straight to `/home`).
 * Wrong password and unknown email read the same (FR-009).
 */
export function LoginPage() {
  const { isSignedIn } = useAuth()
  const form = useLoginForm()
  const { register, errors, onSubmit, isPending, notice, step, code, setCode, onSubmitCode } = form

  if (isSignedIn) return <Navigate to="/home" replace />

  if (step === 'verify-device') {
    return (
      <AuthLayout title="Confirma que eres tú" subtitle="Es la primera vez que entras desde este dispositivo.">
        <form onSubmit={onSubmitCode} noValidate className="flex flex-col gap-6">
          <p className="text-base text-slate-600">
            Te enviamos un código a tu correo. Escríbelo aquí para terminar de iniciar sesión.
          </p>
          <Field id="login-code" text="Código de verificación">
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              size={1}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={`${field} border-slate-300`}
            />
          </Field>
          {notice && (
            <Notice tone={notice.tone} action={notice.action}>
              {notice.message}
            </Notice>
          )}
          <button type="submit" disabled={isPending} className={solidButton}>
            {isPending ? 'Verificando…' : 'Verificar código'}
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Iniciar sesión" subtitle="Entra a tu cuenta para ver el historial de tus hijos.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Field id="email" text="Correo" error={errors.email ? EMAIL_MESSAGE : undefined}>
          <input
            id="email"
            type="email"
            size={1}
            autoComplete="email"
            placeholder="tu@correo.mx"
            className={`${field} ${border(!!errors.email)}`}
            {...register('email', emailValidation)}
          />
        </Field>

        <Field id="password" text="Contraseña" error={errors.password ? 'Escribe tu contraseña.' : undefined}>
          <PasswordInput
            id="password"
            registration={register('password', { required: true })}
            className={`${field} ${border(!!errors.password)}`}
            autoComplete="current-password"
            placeholder="Tu contraseña"
          />
          <Link to="/recuperar-contrasena" className="self-start text-[13px] font-bold text-action hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </Field>

        {notice && (
          <Notice tone={notice.tone} action={notice.action}>
            {notice.message}
          </Notice>
        )}

        <button type="submit" disabled={isPending} className={solidButton}>
          {isPending ? 'Entrando…' : 'Iniciar sesión'}
        </button>

        <GoogleSignupButton label="Continuar con Google" />

        <p className="text-center text-[15px] text-slate-600">
          ¿Aún no tienes cuenta?{' '}
          <Link to="/signup" className="font-extrabold text-action hover:underline">
            Crear cuenta
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
