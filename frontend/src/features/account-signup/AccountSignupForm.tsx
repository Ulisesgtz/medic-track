import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useCountries, useStates } from '../../shared/catalog/useCatalog'
import { useAccountSignup } from './useAccountSignup'
import { ChildFieldset } from './ChildFieldset'
import { FreemiumLimitModal } from './FreemiumLimitModal'
import { CreateAccountError, type CreateAccountPayload } from './api'
import type { AccountSignupFormValues } from './types'
import { emptyChild, NAME_MAX_LENGTH, NAME_PATTERN } from './types'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'
const errorClass = 'mt-1 text-sm text-red-600'

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
      className="space-y-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-md md:p-8"
    >
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Crear cuenta</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registra tus datos y, si quieres, agrega a tus hijos para empezar a llevar su bitácora.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Datos del tutor
        </h2>

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
              País <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <select id="countryCode" className={inputClass} {...register('countryCode')}>
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
                Estado <span className="font-normal text-slate-400">(opcional)</span>
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

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hijos</h2>
          <p className="mt-1 text-sm text-slate-500">
            El plan gratuito incluye un hijo. Puedes agregar más y decidir después.
          </p>
        </div>

        <div className="space-y-3">
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
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 transition-colors duration-200 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Este correo ya está en uso.
          </p>
        )}

      {signup.isSuccess && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Cuenta creada exitosamente.
        </p>
      )}

      <button
        type="submit"
        disabled={signup.isPending}
        className="w-full cursor-pointer rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
      >
        {signup.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
