import { useEffect, useState, type FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useAuth, useSignUp } from '@clerk/react'
import { clerkNotice, type ClerkNotice } from '../../shared/auth/clerkMessages'
import { useCountries, useStates } from '../../shared/catalog/useCatalog'
import { CreateAccountError, type CreateAccountPayload } from './api'
import { emptyChild, type AccountSignupFormValues } from './types'
import { useAccountSignup } from './useAccountSignup'

// The password never reaches PediTrack's own backend (FR-010) — Clerk is
// the only one who ever sees it (signUp.password() below). `email` also
// stops being part of the payload: the backend takes it from the same
// Clerk session, never from client input (specs/008-autenticacion-cuenta,
// research.md punto 6).
function toPayload(values: AccountSignupFormValues): CreateAccountPayload {
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

const GENERIC_CLERK_ERROR = 'No se pudo crear tu cuenta. Intenta de nuevo.'
const INVALID_CODE_ERROR = 'El código no es correcto. Revisa tu correo e intenta de nuevo.'
const GENERIC_SAVE_ERROR = 'Ocurrió un error al guardar la cuenta. Intenta de nuevo.'

/**
 * The signup form's state and submit flow, shared by the phone and the web
 * designs (which only differ in how they draw it): the fields, validation,
 * the catalog, and — new in specs/008-autenticacion-cuenta — completing the
 * sign-up with Clerk (correo+contraseña) before creating the PediTrack
 * account itself. Google sign-up is a separate entry point
 * (GoogleSignupButton → SsoCallbackPage), not part of this form's submit.
 *
 * Flow: `signUp.password(...)` → if Clerk still needs to verify the email
 * (`step` becomes `'verify-email'`), the caller renders a one-field form for
 * the code Clerk emailed, submitted via `onSubmitCode`; once the sign-up is
 * `'complete'` (with or without that extra step), `signUp.finalize()`
 * activates the session and only then does `POST /accounts` run, with that
 * session's token.
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
  const password = useWatch({ control, name: 'password' })
  const { data: countries } = useCountries()
  const { data: states } = useStates(countryCode || undefined)

  const { signUp } = useSignUp()
  const { getToken } = useAuth()
  const signup = useAccountSignup()
  const navigate = useNavigate()

  const [step, setStep] = useState<'form' | 'verify-email'>('form')
  const [pendingValues, setPendingValues] = useState<AccountSignupFormValues | null>(null)
  const [code, setCode] = useState('')
  const [isClerkPending, setIsClerkPending] = useState(false)
  const [clerkError, setClerkError] = useState<ClerkNotice | null>(null)

  async function finishAccountCreation(values: AccountSignupFormValues) {
    if (!signUp) return
    const { error } = await signUp.finalize()
    if (error) {
      setClerkError(clerkNotice(error, GENERIC_CLERK_ERROR))
      setIsClerkPending(false)
      return
    }
    const token = await getToken()
    signup.mutate({ payload: toPayload(values), token })
    setIsClerkPending(false)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!signUp) return
    setClerkError(null)
    setIsClerkPending(true)

    const { error } = await signUp.password({ emailAddress: values.email, password: values.password })
    if (error) {
      setClerkError(clerkNotice(error, GENERIC_CLERK_ERROR))
      setIsClerkPending(false)
      return
    }

    if (signUp.status === 'complete') {
      await finishAccountCreation(values)
      return
    }

    const sent = await signUp.verifications.sendEmailCode()
    if (sent.error) {
      setClerkError(clerkNotice(sent.error, GENERIC_CLERK_ERROR))
      setIsClerkPending(false)
      return
    }
    setPendingValues(values)
    setStep('verify-email')
    setIsClerkPending(false)
  })

  async function onSubmitCode(event: FormEvent) {
    event.preventDefault()
    if (!signUp || !pendingValues) return
    setClerkError(null)
    setIsClerkPending(true)

    const { error } = await signUp.verifications.verifyEmailCode({ code })
    if (error) {
      setClerkError(clerkNotice(error, INVALID_CODE_ERROR))
      setIsClerkPending(false)
      return
    }
    await finishAccountCreation(pendingValues)
  }

  useEffect(() => {
    if (signup.isSuccess) {
      navigate('/home')
    }
  }, [signup.isSuccess, navigate])

  // The message under the button for a server rejection. The generic fallback
  // is the only feedback path for server-side rules with no client-side
  // equivalent — don't remove it.
  let serverNotice: ClerkNotice | null = clerkError
  if (!serverNotice && signup.isError) {
    const message =
      signup.error instanceof CreateAccountError
        ? signup.error.kind === 'email_already_exists'
          ? 'Este correo ya está en uso.'
          : (signup.error.message ?? GENERIC_SAVE_ERROR)
        : GENERIC_SAVE_ERROR
    serverNotice = { tone: 'error', message }
  }

  return {
    register,
    setValue,
    errors,
    onSubmit,
    countryCode,
    password,
    countries,
    states,
    isPending: isClerkPending || signup.isPending,
    serverNotice,
    step,
    code,
    setCode,
    onSubmitCode,
  }
}

export type SignupForm = ReturnType<typeof useSignupForm>
