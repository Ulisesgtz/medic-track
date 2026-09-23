import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { PasswordField } from '../account-signup/PasswordField'
import { EMAIL_MESSAGE, PASSWORD_MESSAGE, emailValidation, passwordValidation } from '../account-signup/validation'
import { FormField as Field } from '../../shared/ui/FormField'
import { Notice } from '../../shared/ui/Notice'
import { AuthLayout } from './AuthLayout'
import { useForgotPassword } from './useForgotPassword'

const field =
  'min-h-11 w-full min-w-0 rounded-2xl border-[1.5px] px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const border = (invalid: boolean) => (invalid ? 'border-red-600' : 'border-slate-300')
const solidButton =
  'min-h-11 cursor-pointer rounded-2xl bg-confirmed py-4 text-base font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * `/recuperar-contrasena`: ask for a code by correo, then choose a new
 * password with it (which also signs the tutor in).
 */
export function ForgotPasswordPage() {
  const { isSignedIn } = useAuth()
  const { emailForm, resetForm, password, step, notice, isPending, onSubmitEmail, onSubmitReset } = useForgotPassword()

  if (isSignedIn) return <Navigate to="/home" replace />

  const backToLogin = (
    <p className="text-center text-[15px] text-slate-600">
      <Link to="/login" className="font-extrabold text-action hover:underline">
        Volver a iniciar sesión
      </Link>
    </p>
  )

  if (step === 'email') {
    const { register, formState } = emailForm
    return (
      <AuthLayout title="Recupera tu contraseña" subtitle="Te enviamos un código a tu correo para elegir una nueva.">
        <form onSubmit={onSubmitEmail} noValidate className="flex flex-col gap-6">
          <Field id="email" text="Correo" error={formState.errors.email ? EMAIL_MESSAGE : undefined}>
            <input
              id="email"
              type="email"
              size={1}
              autoComplete="email"
              placeholder="tu@correo.mx"
              className={`${field} ${border(!!formState.errors.email)}`}
              {...register('email', emailValidation)}
            />
          </Field>
          {notice && (
            <Notice tone={notice.tone} action={notice.action}>
              {notice.message}
            </Notice>
          )}
          <button type="submit" disabled={isPending} className={solidButton}>
            {isPending ? 'Enviando…' : 'Enviar código'}
          </button>
          {backToLogin}
        </form>
      </AuthLayout>
    )
  }

  const { register, formState } = resetForm
  return (
    <AuthLayout title="Elige tu nueva contraseña" subtitle="Escribe el código que te enviamos y tu nueva contraseña.">
      <form onSubmit={onSubmitReset} noValidate className="flex flex-col gap-6">
        <Notice tone="info">Si el correo tiene una cuenta, te enviamos un código. Puede tardar un minuto.</Notice>
        <Field id="reset-code" text="Código de verificación" error={formState.errors.code ? 'Escribe el código.' : undefined}>
          <input
            id="reset-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            size={1}
            placeholder="123456"
            className={`${field} ${border(!!formState.errors.code)}`}
            {...register('code', { required: true })}
          />
        </Field>
        <PasswordField
          registration={register('password', passwordValidation)}
          value={password ?? ''}
          error={formState.errors.password ? PASSWORD_MESSAGE : undefined}
          inputClassName={`${field} ${border(!!formState.errors.password)}`}
        />
        {notice && (
          <Notice tone={notice.tone} action={notice.action}>
            {notice.message}
          </Notice>
        )}
        <button type="submit" disabled={isPending} className={solidButton}>
          {isPending ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
        {backToLogin}
      </form>
    </AuthLayout>
  )
}
