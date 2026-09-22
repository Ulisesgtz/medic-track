import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useCountries, useStates } from '../../shared/catalog/useCatalog'
import { CreateAccountError, type CreateAccountPayload } from './api'
import { emptyChild, type AccountSignupFormValues } from './types'
import { useAccountSignup } from './useAccountSignup'

// The password is deliberately not part of the payload: it isn't stored
// anywhere until authentication (Clerk / AWS Cognito, see BACKLOG.md) exists.
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

/**
 * The signup form's state and submit flow, shared by the phone and the web
 * designs (which only differ in how they draw it): the fields, validation,
 * the catalog, the request, and — on success — saving the account id and
 * going to the home (FR-003 of specs/003-home-listado-hijos).
 */
export function useSignupForm() {
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
      password: '',
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

  // TODO(specs/008, Historia 1): before calling signup.mutate, this must first
  // complete a Clerk sign-up (signUp.password()/signUp.finalize() or Google)
  // and send its token — the session itself is what "logs the tutor in" now,
  // not a value saved from this response (see plan.md/tasks.md T026).
  useEffect(() => {
    if (signup.isSuccess) {
      navigate('/home')
    }
  }, [signup.isSuccess, navigate])

  const onSubmit = handleSubmit((values) => {
    signup.mutate(toPayload(values))
  })

  // The message under the button for a server rejection. The generic fallback
  // is the only feedback path for server-side rules with no client-side
  // equivalent — don't remove it.
  let serverError: string | null = null
  if (signup.isError) {
    if (signup.error instanceof CreateAccountError) {
      serverError =
        signup.error.kind === 'email_already_exists'
          ? 'Este correo ya está en uso.'
          : (signup.error.message ?? 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.')
    } else {
      serverError = 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.'
    }
  }

  return {
    register,
    setValue,
    errors,
    onSubmit,
    countryCode,
    countries,
    states,
    isPending: signup.isPending,
    serverError,
  }
}

export type SignupForm = ReturnType<typeof useSignupForm>
