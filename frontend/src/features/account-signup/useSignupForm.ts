import { useEffect, useRef, useState, type FormEvent } from 'react'
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
 * session's token. The status is *reacted to* on each render (the `attempt`
 * counter), never read right after an `await` — the hook hands out a new
 * snapshot on the next render. If `POST /accounts` fails after Clerk
 * finished, submitting again only repeats the POST (`sessionReady`).
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
  // Clerk is done (session active) but POST /accounts may still have to be retried: a retry must
  // skip Clerk, whose sign-up can't be run twice.
  const [sessionReady, setSessionReady] = useState(false)
  // Bumped every time a Clerk step succeeded, so the effect below re-reads `signUp.status`; 0 = idle.
  const [attempt, setAttempt] = useState(0)
  // Each submit starts a new flow; the refs remember which flow already sent its code / finalized.
  const [flow, setFlow] = useState(0)
  const codeRequestedFlow = useRef(0)
  const finalizedFlow = useRef(0)

  const status = signUp?.status
  const { mutate: createAccountMutate } = signup

  useEffect(() => {
    if (!signUp || attempt === 0 || !pendingValues) return
    const values = pendingValues

    function fail(error: Parameters<typeof clerkNotice>[0]) {
      setClerkError(clerkNotice(error, GENERIC_CLERK_ERROR))
      setIsClerkPending(false)
      setAttempt(0)
    }

    async function react() {
      if (!signUp) return
      if (status === 'complete') {
        if (finalizedFlow.current === flow) return
        finalizedFlow.current = flow
        const { error } = await signUp.finalize()
        if (error) {
          finalizedFlow.current = 0
          fail(error)
          return
        }
        setSessionReady(true)
        createAccountMutate({ payload: toPayload(values), token: await getToken() })
        setIsClerkPending(false)
        return
      }
      // Not complete yet: Clerk wants the email verified first.
      if (codeRequestedFlow.current === flow) return
      codeRequestedFlow.current = flow
      const sent = await signUp.verifications.sendEmailCode()
      if (sent.error) {
        codeRequestedFlow.current = 0
        fail(sent.error)
        return
      }
      setStep('verify-email')
      setIsClerkPending(false)
    }
    void react()
  }, [signUp, status, attempt, flow, pendingValues, createAccountMutate, getToken])

  const onSubmit = handleSubmit(async (values) => {
    if (!signUp) return
    setClerkError(null)
    setIsClerkPending(true)

    if (sessionReady) {
      // A previous submit already got Clerk's session; only PediTrack's own POST failed.
      createAccountMutate({ payload: toPayload(values), token: await getToken() })
      setIsClerkPending(false)
      return
    }

    setFlow((n) => n + 1)
    const { error } = await signUp.password({ emailAddress: values.email, password: values.password })
    if (error) {
      setClerkError(clerkNotice(error, GENERIC_CLERK_ERROR))
      setIsClerkPending(false)
      return
    }
    setPendingValues(values)
    setAttempt((n) => n + 1)
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
    // The status turns 'complete' on the next render; the effect above finalizes.
    setAttempt((n) => n + 1)
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
