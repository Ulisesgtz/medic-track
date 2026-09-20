import { useState } from 'react'
import { FormField as Field } from '../../shared/ui/FormField'
import { Logo } from '../../shared/ui/Logo'
import {
  BIRTH_DATE_MESSAGE,
  CHILD_NAME_MESSAGE,
  EMAIL_MESSAGE,
  PASSWORD_MESSAGE,
  emailValidation,
  nameError,
  nameValidation,
  passwordValidation,
  positiveNumberValidation,
} from './validation'
import type { SignupForm } from './useSignupForm'

const border = (invalid: boolean, normal: string) => (invalid ? 'border-red-600' : normal)

// Mock 11: `rounded-xl border-[1.5px] px-4 py-3` for the account fields; the
// child block's fields add `bg-surface` and the cyan border.
const accountField =
  'min-h-11 w-full min-w-0 rounded-xl border-[1.5px] px-4 py-3 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const childField = `${accountField} bg-surface`

const CHECKLIST = [
  'El OCR de la receta corre en tu dispositivo.',
  'Tu pediatra sigue siendo la única autoridad médica.',
  'El plan gratuito incluye un hijo.',
]

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * The web signup (mock 11): split screen — dark panel with the value
 * proposition and checklist on the left, the form on the right, in the mock's
 * order (Correo, Contraseña, the "Hijo 1 · Gratis" block, "Crear cuenta").
 * Not the phone design — that one is `SignupPhone`; they are never mixed.
 *
 * Deviations from the mock, by decision:
 * - The account also asks for the tutor's first/last name and (optionally)
 *   país/estado, and the child block has separate Nombre/Apellido plus
 *   optional talla/peso: the account model stores them.
 * - "Contraseña" is only validated (min. 8), never sent or stored: the
 *   authentication (Clerk or AWS Cognito) is a later feature (BACKLOG.md).
 * - "Registrarme con Google" is not in the mock: the user asked for it, but
 *   it can't work until that same authentication exists, so for now it only
 *   says it's coming.
 */
export function SignupWeb({ form }: { form: SignupForm }) {
  const { register, setValue, errors, onSubmit, countryCode, countries, states, isPending, serverError } = form
  const childErrors = errors.children?.[0]
  const [googleNote, setGoogleNote] = useState(false)

  return (
    <div className="flex min-h-screen">
      <section className="flex w-[46%] flex-col justify-between gap-10 bg-ink px-16 py-16">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-black tracking-tight text-white">
            Pedi<span className="text-[#67e8f9]">Track</span>
          </span>
        </div>
        <div className="max-w-md">
          <h1 className="text-5xl leading-[1.05] font-black tracking-tight text-white">
            La bitácora médica de tus hijos, en un solo lugar.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[#a5f3fc]">
            Registra consultas, recetas y tomas de medicamento. La app registra datos, nunca los interpreta.
          </p>
        </div>
        <ul className="flex flex-col gap-3.5">
          {CHECKLIST.map((item) => (
            <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#cffafe]">
              <span className="mt-0.5 text-bright" aria-hidden="true">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-1 items-center justify-center bg-surface px-16 py-12">
        <form onSubmit={onSubmit} noValidate className="flex w-full max-w-[520px] flex-col gap-6">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-ink">Crear cuenta</h2>
            <p className="mt-2 text-base text-slate-600">Empieza con el primer hijo; puedes agregar más después.</p>
          </div>

          <Field id="email" text="Correo" error={errors.email ? EMAIL_MESSAGE : undefined}>
            <input
              id="email"
              type="email"
              size={1}
              autoComplete="email"
              placeholder="tu@correo.mx"
              className={`${accountField} ${border(!!errors.email, 'border-slate-300')}`}
              {...register('email', emailValidation)}
            />
          </Field>

          <Field id="password" text="Contraseña" error={errors.password ? PASSWORD_MESSAGE : undefined}>
            <input
              id="password"
              type="password"
              size={1}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className={`${accountField} ${border(!!errors.password, 'border-slate-300')}`}
              {...register('password', passwordValidation)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="firstName" text="Tu nombre" error={nameError(errors.firstName, 'El nombre')}>
              <input
                id="firstName"
                size={1}
                autoComplete="given-name"
                className={`${accountField} ${border(!!errors.firstName, 'border-slate-300')}`}
                {...register('firstName', nameValidation)}
              />
            </Field>
            <Field id="lastName" text="Tu apellido" error={nameError(errors.lastName, 'El apellido')}>
              <input
                id="lastName"
                size={1}
                autoComplete="family-name"
                className={`${accountField} ${border(!!errors.lastName, 'border-slate-300')}`}
                {...register('lastName', nameValidation)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="countryCode" text="País (opcional)">
              <select
                id="countryCode"
                className={`${accountField} border-slate-300 bg-surface`}
                {...register('countryCode', {
                  // A previously-selected estado belongs to the previous país
                  // and must not be silently carried over/submitted (the backend
                  // only checks each code exists, not that they match).
                  onChange: () => setValue('stateCode', ''),
                })}
              >
                <option value="">Selecciona un país</option>
                {countries?.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            {countryCode && states && states.length > 0 && (
              <Field id="stateCode" text="Estado (opcional)">
                <select id="stateCode" className={`${accountField} border-slate-300 bg-surface`} {...register('stateCode')}>
                  <option value="">Selecciona un estado</option>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <fieldset
            aria-label="Hijo 1"
            data-testid="child-fieldset-0"
            className="flex min-w-0 flex-col gap-4 rounded-3xl border-[1.5px] border-hint-border bg-hint p-6"
          >
            <div className="flex items-center justify-between">
              <legend className="rounded-full bg-action px-3 py-1.5 text-xs font-extrabold tracking-wider text-white uppercase">
                Hijo 1
              </legend>
              <span className="text-[13px] font-semibold text-action">Gratis</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                id="children.0.firstName"
                text="Nombre"
                error={nameError(childErrors?.firstName, 'El nombre del hijo', CHILD_NAME_MESSAGE)}
              >
                <input
                  id="children.0.firstName"
                  size={1}
                  placeholder="Nombre"
                  className={`${childField} ${border(!!childErrors?.firstName, 'border-[#67e8f9]')}`}
                  {...register('children.0.firstName', nameValidation)}
                />
              </Field>
              <Field id="children.0.lastName" text="Apellido" error={nameError(childErrors?.lastName, 'El apellido del hijo')}>
                <input
                  id="children.0.lastName"
                  size={1}
                  placeholder="Apellido"
                  className={`${childField} ${border(!!childErrors?.lastName, 'border-[#67e8f9]')}`}
                  {...register('children.0.lastName', nameValidation)}
                />
              </Field>
            </div>

            <Field id="children.0.birthDate" text="Fecha de nacimiento" error={childErrors?.birthDate ? BIRTH_DATE_MESSAGE : undefined}>
              <input
                id="children.0.birthDate"
                type="date"
                size={1}
                className={`${childField} ${border(!!childErrors?.birthDate, 'border-[#67e8f9]')}`}
                {...register('children.0.birthDate', { required: true })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                id="children.0.height"
                text="Talla (cm) (opcional)"
                error={childErrors?.height?.type === 'min' ? 'La talla debe ser un número positivo' : undefined}
              >
                <input
                  id="children.0.height"
                  type="number"
                  step="0.1"
                  size={1}
                  className={`${childField} ${border(!!childErrors?.height, 'border-[#67e8f9]')}`}
                  {...register('children.0.height', positiveNumberValidation)}
                />
              </Field>
              <Field
                id="children.0.weight"
                text="Peso (kg) (opcional)"
                error={childErrors?.weight?.type === 'min' ? 'El peso debe ser un número positivo' : undefined}
              >
                <input
                  id="children.0.weight"
                  type="number"
                  step="0.1"
                  size={1}
                  className={`${childField} ${border(!!childErrors?.weight, 'border-[#67e8f9]')}`}
                  {...register('children.0.weight', positiveNumberValidation)}
                />
              </Field>
            </div>
          </fieldset>

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
            {isPending ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <div className="flex items-center gap-4 text-[13px] font-semibold text-slate-500">
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />o<span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setGoogleNote(true)}
              className="flex min-h-11 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-slate-300 bg-surface py-3.5 text-base font-extrabold text-ink transition-colors duration-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              <GoogleIcon />
              Registrarme con Google
            </button>
            {googleNote && (
              <p role="status" className="text-[13px] font-semibold text-action">
                El registro con Google estará disponible pronto.
              </p>
            )}
          </div>

          <p className="text-[13px] leading-relaxed text-slate-500">
            Al crear la cuenta aceptas que los datos se guardan para tu uso personal. No se comparten con terceros.
          </p>
        </form>
      </section>
    </div>
  )
}
