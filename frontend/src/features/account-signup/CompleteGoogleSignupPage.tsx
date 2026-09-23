import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useCountries, useStates } from '../../shared/catalog/useCatalog'
import { FormField as Field } from '../../shared/ui/FormField'
import { Logo } from '../../shared/ui/Logo'
import { Notice } from '../../shared/ui/Notice'
import { CreateAccountError, type CreateAccountPayload } from './api'
import { useAccountSignup } from './useAccountSignup'
import { emptyChild, type AccountSignupFormValues } from './types'
import { BIRTH_DATE_MESSAGE, CHILD_NAME_MESSAGE, nameError, nameValidation, positiveNumberValidation } from './validation'

// Google already gave Clerk the tutor's identity (correo, and no password to
// ask) — this only collects what PediTrack's own Account model still needs.
type FormValues = Omit<AccountSignupFormValues, 'email' | 'password'>

const field =
  'min-h-11 w-full min-w-0 rounded-2xl border-[1.5px] px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const childField = `${field} bg-hint`
const border = (invalid: boolean, normal: string) => (invalid ? 'border-red-600' : normal)

function toPayload(values: FormValues): CreateAccountPayload {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
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

/**
 * `/registro/completar` — where a brand-new Google sign-up lands
 * (`SsoCallbackPage`, specs/008-autenticacion-cuenta, Historia 1): the Clerk
 * session already exists, but there's still no PediTrack `Account` for it
 * (Google never asked for the tutor's name or the first child). No mock
 * covers this — spec 007 didn't anticipate real authentication — so it
 * follows `design-tokens.md` directly rather than a delivered design.
 */
export function CompleteGoogleSignupPage() {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { firstName: '', lastName: '', countryCode: '', stateCode: '', children: [emptyChild] },
  })
  const countryCode = useWatch({ control, name: 'countryCode' })
  const { data: countries } = useCountries()
  const { data: states } = useStates(countryCode || undefined)
  const childErrors = errors.children?.[0]

  const { getToken } = useAuth()
  const signup = useAccountSignup()
  const navigate = useNavigate()

  useEffect(() => {
    if (signup.isSuccess) {
      navigate('/home')
    }
  }, [signup.isSuccess, navigate])

  const onSubmit = handleSubmit(async (values) => {
    const token = await getToken()
    try {
      // Awaited, so `isSubmitting` covers the token fetch *and* the POST: a fast double click can't send twice.
      await signup.mutateAsync({ payload: toPayload(values), token })
    } catch {
      // Shown through `signup.isError` below.
    }
  })

  let serverError: string | null = null
  if (signup.isError) {
    serverError =
      signup.error instanceof CreateAccountError
        ? signup.error.message ?? 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.'
        : 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.'
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
      <div className="w-full max-w-lg rounded-3xl bg-surface p-8 shadow-xl">
        <div className="flex justify-center">
          <Logo size={44} />
        </div>
        <h1 className="mt-6 text-center text-3xl font-black tracking-tight text-ink">Ya casi terminas</h1>
        <p className="mt-2 text-center text-base text-slate-600">
          Solo falta tu nombre y el de tu primer hijo para crear tu cuenta en PediTrack.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <Field id="firstName" text="Tu nombre" error={nameError(errors.firstName, 'El nombre')}>
              <input
                id="firstName"
                size={1}
                autoComplete="given-name"
                className={`${field} ${border(!!errors.firstName, 'border-slate-300')}`}
                {...register('firstName', nameValidation)}
              />
            </Field>
            <Field id="lastName" text="Tu apellido" error={nameError(errors.lastName, 'El apellido')}>
              <input
                id="lastName"
                size={1}
                autoComplete="family-name"
                className={`${field} ${border(!!errors.lastName, 'border-slate-300')}`}
                {...register('lastName', nameValidation)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="countryCode" text="País (opcional)">
              <select
                id="countryCode"
                className={`${field} border-slate-300 bg-surface`}
                {...register('countryCode', { onChange: () => setValue('stateCode', '') })}
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
                <select id="stateCode" className={`${field} border-slate-300 bg-surface`} {...register('stateCode')}>
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
                  className={`${childField} ${border(!!childErrors?.firstName, 'border-[#67e8f9]')}`}
                  {...register('children.0.firstName', nameValidation)}
                />
              </Field>
              <Field id="children.0.lastName" text="Apellido" error={nameError(childErrors?.lastName, 'El apellido del hijo')}>
                <input
                  id="children.0.lastName"
                  size={1}
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

          {serverError && <Notice tone="error">{serverError}</Notice>}

          <button
            type="submit"
            disabled={signup.isPending || isSubmitting}
            className="min-h-11 cursor-pointer rounded-2xl bg-confirmed py-4 text-base font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signup.isPending || isSubmitting ? 'Creando cuenta…' : 'Terminar mi registro'}
          </button>
        </form>
      </div>
    </main>
  )
}
