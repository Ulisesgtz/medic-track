import { useEffect, useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useCountries, useStates } from '../../shared/catalog/useCatalog'
import { useAccountSignup } from './useAccountSignup'
import { useAccountSession } from '../home/useAccountSession'
import { AppHeader } from '../../shared/ui/AppHeader'
import { ChildFieldset } from './ChildFieldset'
import { FreemiumLimitModal } from './FreemiumLimitModal'
import { CreateAccountError, type CreateAccountPayload } from './api'
import type { AccountSignupFormValues } from './types'
import { emptyChild, NAME_MAX_LENGTH, NAME_PATTERN } from './types'
import { errorClass, inputClass, labelClass, optionalClass, overlineClass } from '../../shared/ui/formStyles'


// FR-007: the free plan allows at most this many children. There is no paid
// plan implemented yet (see Supuestos in spec.md), so this is a hardcoded
// constant for now rather than something read from account state.
const FREE_PLAN_CHILD_LIMIT = 1

// Letters (incl. accented characters and ñ), spaces, hyphens and
// apostrophes only — mirrors backend/internal/account/service.go's
// validateNameFormat, kept as the single source of truth for the rule.
const nameValidation = { required: true, maxLength: NAME_MAX_LENGTH, pattern: NAME_PATTERN }

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

export function AccountSignupForm() {
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
      children: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'children' })
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

  // FR-007: attempting to add a child beyond the free-plan limit shows the
  // pop-up modal immediately, but does NOT create/reveal that child's fieldset.
  const [freemiumBlocked, setFreemiumBlocked] = useState(false)

  const showFreemiumModal =
    freemiumBlocked ||
    (signup.isError &&
      signup.error instanceof CreateAccountError &&
      signup.error.kind === 'freemium_child_limit_exceeded')

  function handleAddChild() {
    if (fields.length >= FREE_PLAN_CHILD_LIMIT) {
      setFreemiumBlocked(true)
      return
    }
    append(emptyChild)
  }

  function handleStayFree() {
    setFreemiumBlocked(false)
    if (signup.isError) {
      signup.reset()
    }
  }

  const onSubmit = handleSubmit((values) => {
    signup.mutate(toPayload(values))
  })

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="overflow-hidden bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] md:rounded-3xl"
    >
      <AppHeader title="Crear cuenta">
        <p className="max-w-md text-base leading-relaxed text-white/80">
          Registra tus datos y, si quieres, agrega a tus hijos para empezar a llevar su bitácora.
        </p>
      </AppHeader>

      <div className="space-y-9 px-5 py-8 md:px-10 md:py-10">
      <section className="space-y-5">
        <h2 className={overlineClass}>Datos del tutor</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="firstName">
              Nombre
            </label>
            <input id="firstName" className={inputClass} {...register('firstName', nameValidation)} />
            {errors.firstName?.type === 'required' && (
              <span role="alert" className={errorClass}>El nombre es obligatorio</span>
            )}
            {errors.firstName?.type === 'maxLength' && (
              <span role="alert" className={errorClass}>El nombre debe tener máximo 100 caracteres</span>
            )}
            {errors.firstName?.type === 'pattern' && (
              <span role="alert" className={errorClass}>El nombre solo puede contener letras, espacios, guiones y apóstrofes</span>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="lastName">
              Apellido
            </label>
            <input id="lastName" className={inputClass} {...register('lastName', nameValidation)} />
            {errors.lastName?.type === 'required' && (
              <span role="alert" className={errorClass}>El apellido es obligatorio</span>
            )}
            {errors.lastName?.type === 'maxLength' && (
              <span role="alert" className={errorClass}>El apellido debe tener máximo 100 caracteres</span>
            )}
            {errors.lastName?.type === 'pattern' && (
              <span role="alert" className={errorClass}>El apellido solo puede contener letras, espacios, guiones y apóstrofes</span>
            )}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="email">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            className={inputClass}
            {...register('email', { required: true })}
          />
          {errors.email && <span role="alert" className={errorClass}>El correo es obligatorio</span>}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="countryCode">
              País <span className={optionalClass}>(opcional)</span>
            </label>
            <select
              id="countryCode"
              className={inputClass}
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
          </div>

          {countryCode && states && states.length > 0 && (
            <div>
              <label className={labelClass} htmlFor="stateCode">
                Estado <span className={optionalClass}>(opcional)</span>
              </label>
              <select id="stateCode" className={inputClass} {...register('stateCode')}>
                <option value="">Selecciona un estado</option>
                {states.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className={overlineClass}>Hijos</h2>
          <p className="mt-2 text-base text-slate-600">
            El plan gratuito incluye un hijo. Puedes agregar más y decidir después.
          </p>
        </div>

        <div className="space-y-4">
          {fields.map((field, index) => (
            <ChildFieldset
              key={field.id}
              index={index}
              register={register}
              errors={errors}
              onRemove={() => remove(index)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddChild}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border-2 border-action px-5 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
          Agregar hijo
        </button>
      </section>

      {showFreemiumModal && (
        <FreemiumLimitModal
          onViewPlans={() => window.location.assign('/planes')}
          onStayFree={handleStayFree}
        />
      )}

      {signup.isError &&
        signup.error instanceof CreateAccountError &&
        signup.error.kind === 'email_already_exists' && (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
            Este correo ya está en uso.
          </p>
        )}

      {/* Fallback for any other server rejection (e.g. a field the client
          didn't validate, like a negative height/weight, or an unexpected
          network/response error) — without this, those errors previously
          failed silently with the Guardar button just stopping. */}
      {signup.isError &&
        !showFreemiumModal &&
        !(signup.error instanceof CreateAccountError && signup.error.kind === 'email_already_exists') && (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
            {signup.error instanceof CreateAccountError
              ? (signup.error.message ?? 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.')
              : 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.'}
          </p>
        )}

      <button
        type="submit"
        disabled={signup.isPending}
        className="min-h-11 w-full cursor-pointer rounded-2xl bg-confirmed px-8 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
      >
        {signup.isPending ? 'Guardando…' : 'Guardar'}
      </button>
      </div>
    </form>
  )
}
