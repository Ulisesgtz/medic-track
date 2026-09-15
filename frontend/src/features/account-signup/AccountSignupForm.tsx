import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useCountries, useStates } from '../../shared/catalog/useCatalog'
import { useAccountSignup } from './useAccountSignup'
import { ChildFieldset } from './ChildFieldset'
import { FreemiumBanner } from './FreemiumBanner'
import { CreateAccountError, type CreateAccountPayload } from './api'
import type { AccountSignupFormValues } from './types'
import { emptyChild } from './types'

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

  // FR-007: the banner appears as soon as a second child block exists on the
  // client, not only when the server rejects the save.
  const showFreemiumBanner =
    fields.length > 1 ||
    (signup.isError &&
      signup.error instanceof CreateAccountError &&
      signup.error.kind === 'freemium_child_limit_exceeded')

  const onSubmit = handleSubmit((values) => {
    signup.mutate(toPayload(values))
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1>Crear cuenta</h1>

      <label htmlFor="firstName">Nombre</label>
      <input id="firstName" {...register('firstName', { required: true })} />
      {errors.firstName && <span role="alert">El nombre es obligatorio</span>}

      <label htmlFor="lastName">Apellido</label>
      <input id="lastName" {...register('lastName', { required: true })} />
      {errors.lastName && <span role="alert">El apellido es obligatorio</span>}

      <label htmlFor="email">Correo electrónico</label>
      <input id="email" type="email" {...register('email', { required: true })} />
      {errors.email && <span role="alert">El correo es obligatorio</span>}

      <label htmlFor="countryCode">País</label>
      <select id="countryCode" {...register('countryCode')}>
        <option value="">Selecciona un país</option>
        {countries?.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      {countryCode && states && states.length > 0 && (
        <>
          <label htmlFor="stateCode">Estado</label>
          <select id="stateCode" {...register('stateCode')}>
            <option value="">Selecciona un estado</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      )}

      <section>
        <h2>Hijos</h2>
        {fields.map((field, index) => (
          <ChildFieldset
            key={field.id}
            index={index}
            register={register}
            errors={errors}
            onRemove={() => remove(index)}
          />
        ))}
        <button type="button" onClick={() => append(emptyChild)}>
          Agregar hijo
        </button>
      </section>

      {showFreemiumBanner && (
        <FreemiumBanner onViewPlans={() => window.location.assign('/planes')} />
      )}

      {signup.isError &&
        signup.error instanceof CreateAccountError &&
        signup.error.kind === 'email_already_exists' && (
          <p role="alert">Este correo ya está en uso.</p>
        )}

      {signup.isSuccess && <p role="status">Cuenta creada exitosamente.</p>}

      <button type="submit" disabled={signup.isPending}>
        Guardar
      </button>
    </form>
  )
}
