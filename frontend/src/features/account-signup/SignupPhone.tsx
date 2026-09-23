import { FormField as Field } from '../../shared/ui/FormField'
import { Logo } from '../../shared/ui/Logo'
import { EmailCodeStep } from './EmailCodeStep'
import { GoogleSignupButton } from './GoogleSignupButton'
import { PasswordField } from './PasswordField'
import { Notice } from '../../shared/ui/Notice'
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

const tutorField =
  'min-h-11 w-full min-w-0 rounded-2xl border-[1.5px] px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const childField =
  'min-h-11 w-full min-w-0 rounded-xl border-[1.5px] bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'

/**
 * The phone signup (mock 01): dark header with the value proposition, then
 * the form in the mock's order (Correo, Contraseña, the "Hijo 1 · Gratis"
 * block, "Crear cuenta"). Not the web design — that one is `SignupWeb`; they
 * are never mixed.
 *
 * Deviations from the mock, by decision: the account also asks for the tutor's
 * first/last name and (optionally) país/estado, and the child block has
 * separate Nombre/Apellido plus optional talla/peso (the account model stores
 * them); "Contraseña" is only validated (min. 8), never sent or stored — the
 * authentication (Clerk or AWS Cognito) is a later feature (BACKLOG.md); and
 * "Registrarme con Google" is not in the mock (requested; says "pronto").
 */
export function SignupPhone({ form }: { form: SignupForm }) {
  const { register, setValue, errors, onSubmit, countryCode, countries, states, isPending, serverNotice, step, password } = form
  const childErrors = errors.children?.[0]

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-surface">
      <header className="bg-ink px-6 pt-6 pb-8">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-black tracking-tight text-white">
            Pedi<span className="text-[#67e8f9]">Track</span>
          </span>
        </div>
        <h1 className="mt-6 text-3xl leading-tight font-black tracking-tight text-white">
          La bitácora médica de tus hijos, en un solo lugar.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[#a5f3fc]">
          Registra, nunca interpreta. Tu pediatra sigue siendo la única autoridad médica.
        </p>
      </header>

      {step === 'verify-email' ? (
        <div className="px-6 pt-7 pb-9">
          <EmailCodeStep form={form} />
        </div>
      ) : (
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 px-6 pt-7 pb-9">
        <Field id="email" text="Correo" error={errors.email ? EMAIL_MESSAGE : undefined}>
          <input
            id="email"
            type="email"
            size={1}
            autoComplete="email"
            placeholder="tu@correo.mx"
            className={`${tutorField} ${border(!!errors.email, 'border-slate-300')}`}
            {...register('email', emailValidation)}
          />
        </Field>

        <PasswordField
          registration={register('password', passwordValidation)}
          value={password ?? ''}
          error={errors.password ? PASSWORD_MESSAGE : undefined}
          inputClassName={`${tutorField} ${border(!!errors.password, 'border-slate-300')}`}
        />

        <div className="flex flex-col gap-6">
          <Field id="firstName" text="Tu nombre" error={nameError(errors.firstName, 'El nombre')}>
            <input
              id="firstName"
              size={1}
              autoComplete="given-name"
              className={`${tutorField} ${border(!!errors.firstName, 'border-slate-300')}`}
              {...register('firstName', nameValidation)}
            />
          </Field>
          <Field id="lastName" text="Tu apellido" error={nameError(errors.lastName, 'El apellido')}>
            <input
              id="lastName"
              size={1}
              autoComplete="family-name"
              className={`${tutorField} ${border(!!errors.lastName, 'border-slate-300')}`}
              {...register('lastName', nameValidation)}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-6">
          <Field id="countryCode" text="País (opcional)">
            <select
              id="countryCode"
              className={`${tutorField} h-[54px] border-slate-300 bg-surface`}
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
              <select id="stateCode" className={`${tutorField} h-[54px] border-slate-300 bg-surface`} {...register('stateCode')}>
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
          className="flex min-w-0 flex-col gap-4 rounded-3xl border-[1.5px] border-hint-border bg-hint p-5"
        >
          <div className="flex items-center justify-between">
            <legend className="rounded-full bg-action px-3 py-1.5 text-xs font-extrabold tracking-wider text-white uppercase">
              Hijo 1
            </legend>
            <span className="text-[13px] font-semibold text-action">Gratis</span>
          </div>

          <div className="flex flex-col gap-4">
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

        {/* Required by Clerk for bot protection on custom sign-up flows — must exist in the
            DOM before signUp.password() runs (Clerk docs: "Add bot protection"). Invisible by
            default; Clerk mounts its own widget into it only when a challenge is needed. */}
        <div id="clerk-captcha" />

        {serverNotice && (
          <Notice tone={serverNotice.tone} action={serverNotice.action}>
            {serverNotice.message}
          </Notice>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="min-h-11 cursor-pointer rounded-2xl bg-confirmed py-4 text-base font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        <GoogleSignupButton />

        <p className="text-center text-[13px] leading-relaxed text-slate-500">
          El plan gratuito incluye un hijo. Puedes agregar más después.
        </p>
      </form>
      )}
    </main>
  )
}
