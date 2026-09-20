import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useCountries, useStates } from '../../shared/catalog/useCatalog'
import { FormField as Field } from '../../shared/ui/FormField'
import { Logo } from '../../shared/ui/Logo'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { useAccountSignup } from './useAccountSignup'
import { useAccountSession } from '../home/useAccountSession'
import { CreateAccountError, type CreateAccountPayload } from './api'
import type { AccountSignupFormValues } from './types'
import { emptyChild } from './types'
import { nameError, nameValidation, positiveNumberValidation } from './validation'

function toPayload(values: AccountSignupFormValues): CreateAccountPayload {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    countryCode: values.countryCode || undefined,
    stateCode: values.stateCode || undefined,
    children: values.children.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      birthDate: c.birthDate,
      height: c.height ? Number(c.height) : undefined,
      weight: c.weight ? Number(c.weight) : undefined,
    })),
  }
}

const border = (invalid: boolean, normal: string) => (invalid ? 'border-red-600' : normal)

/**
 * "Crear cuenta". Two separate designs, chosen by the same rule as the rest
 * of the app (a window of 900px or more is "web"): mockup 01 on the phone
 * (dark header with the value proposition, then the form) and mockup 11 on
 * the web (split screen: dark panel with the checklist on the left, the form
 * on the right). They are never mixed. The first child is part of the form
 * ("Hijo 1 · Gratis"), as in the mocks; more are added later from the home.
 *
 * Deviations from the mocks, by decision: no password field (the app has no
 * authentication yet — it's the next feature in BACKLOG.md), and the tutor
 * and child keep separate first/last name fields plus country/state and
 * height/weight, which the backend model needs.
 */
export function AccountSignupForm() {
  const desktop = useIsDesktop()
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AccountSignupFormValues>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      countryCode: '',
      stateCode: '',
      children: [emptyChild],
    },
  })

  const countryCode = useWatch({ control, name: 'countryCode' })
  const { data: countries } = useCountries()
  const { data: states } = useStates(countryCode || undefined)

  const signup = useAccountSignup()
  const navigate = useNavigate()
  const { setAccountId } = useAccountSession()

  // FR-003: on a successful signup, save the new account id (the only
  // "session" this app has, see specs/003-home-listado-hijos) and navigate
  // straight to the home page, with no extra step from the user.
  useEffect(() => {
    if (signup.isSuccess) {
      setAccountId(signup.data.id)
      navigate('/home')
    }
  }, [signup.isSuccess, signup.data, setAccountId, navigate])

  const onSubmit = handleSubmit((values) => {
    signup.mutate(toPayload(values))
  })

  const childErrors = errors.children?.[0]
  const emailTaken =
    signup.isError && signup.error instanceof CreateAccountError && signup.error.kind === 'email_already_exists'

  // Mock 01: `rounded-2xl py-3.5` fields; mock 11: `rounded-xl py-3`.
  const tutorField = `min-h-11 w-full min-w-0 border-[1.5px] px-4 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none ${
    desktop ? 'rounded-xl py-3' : 'rounded-2xl py-3.5'
  }`
  const childField =
    'min-h-11 w-full min-w-0 rounded-xl border-[1.5px] bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
  // Two-column rows only on the web layout.
  const pair = desktop ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-6'
  const childPair = desktop ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'

  const form = (
    <form
      onSubmit={onSubmit}
      noValidate
      className={
        desktop ? 'flex w-full max-w-[520px] flex-col gap-6' : 'flex flex-col gap-6 px-6 pt-7 pb-9'
      }
    >
      {desktop && (
        <div>
          <h2 className="text-3xl font-black tracking-tight text-ink">Crear cuenta</h2>
          <p className="mt-2 text-base text-slate-600">Empieza con el primer hijo; puedes agregar más después.</p>
        </div>
      )}

      <div className={pair}>
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

      <Field id="email" text="Correo" error={errors.email ? 'Escribe un correo válido.' : undefined}>
        <input
          id="email"
          type="email"
          size={1}
          autoComplete="email"
          placeholder="tu@correo.mx"
          className={`${tutorField} ${border(!!errors.email, 'border-slate-300')}`}
          {...register('email', { required: true })}
        />
      </Field>

      <div className={pair}>
        <Field id="countryCode" text="País (opcional)">
          <select
            id="countryCode"
            className={`${tutorField} border-slate-300 bg-surface`}
            {...register('countryCode', {
              // A previously-selected estado belongs to the previous país
              // and must not be silently carried over/submitted (a stale
              // country/state pair would otherwise be persisted as-is,
              // since the backend only checks each code exists, not that
              // they match each other).
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
            <select id="stateCode" className={`${tutorField} border-slate-300 bg-surface`} {...register('stateCode')}>
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
        className={`flex min-w-0 flex-col gap-4 rounded-3xl border-[1.5px] border-hint-border bg-hint ${desktop ? 'p-6' : 'p-5'}`}
      >
        <div className="flex items-center justify-between">
          <legend className="rounded-full bg-action px-3 py-1.5 text-xs font-extrabold tracking-wider text-white uppercase">
            Hijo 1
          </legend>
          <span className="text-[13px] font-semibold text-action">Gratis</span>
        </div>

        <div className={childPair}>
          <Field id="children.0.firstName" text="Nombre" error={nameError(childErrors?.firstName, 'El nombre del hijo')}>
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

        <Field
          id="children.0.birthDate"
          text="Fecha de nacimiento"
          error={childErrors?.birthDate ? 'Elige la fecha de nacimiento.' : undefined}
        >
          <input
            id="children.0.birthDate"
            type="date"
            size={1}
            className={`${childField} ${border(!!childErrors?.birthDate, 'border-[#67e8f9]')}`}
            {...register('children.0.birthDate', { required: true })}
          />
        </Field>

        <div className={childPair}>
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

      {emailTaken && (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
          Este correo ya está en uso.
        </p>
      )}

      {/* Fallback for any other server rejection (e.g. a field the client
          didn't validate, or an unexpected network/response error) — the
          only feedback path for server-side rules with no client-side equivalent. */}
      {signup.isError && !emailTaken && (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
          {signup.error instanceof CreateAccountError
            ? (signup.error.message ?? 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.')
            : 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.'}
        </p>
      )}

      <button
        type="submit"
        disabled={signup.isPending}
        className="min-h-11 cursor-pointer rounded-2xl bg-confirmed py-4 text-base font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {signup.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
      {desktop ? (
        <p className="text-[13px] leading-relaxed text-slate-500">
          Al crear la cuenta aceptas que los datos se guardan para tu uso personal. No se comparten con terceros.
        </p>
      ) : (
        <p className="text-center text-[13px] leading-relaxed text-slate-500">
          El plan gratuito incluye un hijo. Puedes agregar más después.
        </p>
      )}
    </form>
  )

  // ---- Web (mock 11): split screen.
  if (desktop) {
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
            {[
              'El OCR de la receta corre en tu dispositivo.',
              'Tu pediatra sigue siendo la única autoridad médica.',
              'El plan gratuito incluye un hijo.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#cffafe]">
                <span className="mt-0.5 text-bright" aria-hidden="true">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-1 items-center justify-center bg-surface px-16 py-12">{form}</section>
      </div>
    )
  }

  // ---- Phone (mock 01): dark header, then the form.
  return (
    <div className="min-h-screen bg-surface">
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
      {form}
    </div>
  )
}
