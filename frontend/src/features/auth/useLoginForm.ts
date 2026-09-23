import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/react'
import { clerkNotice, INVALID_CREDENTIALS_MESSAGE, type ClerkNotice } from '../../shared/auth/clerkMessages'

export interface LoginFormValues {
  email: string
  password: string
}

const GENERIC_ERROR = 'No se pudo iniciar sesión. Intenta de nuevo.'
const INVALID_CODE_ERROR = 'El código no es correcto. Revisa tu correo e intenta de nuevo.'

/**
 * The login's state and submit flow (specs/008-autenticacion-cuenta, Historia 2).
 *
 * `signIn.password()` either completes the sign-in or asks for one more step
 * (`needs_client_trust`: Clerk wants to confirm a new device with a code emailed
 * to the tutor; `needs_second_factor`: same, when the account has a second
 * factor). Those are handled by *reacting to `signIn.status`* on each render,
 * not by reading it right after the `await`: the hook hands out a new snapshot
 * on the next render, so a read in the same tick can still see the old status.
 * Every failure of the first step — wrong password, unknown email — shows the
 * same message (FR-009).
 */
export function useLoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ defaultValues: { email: '', password: '' } })

  const { signIn } = useSignIn()
  const navigate = useNavigate()

  const [step, setStep] = useState<'credentials' | 'verify-device'>('credentials')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<ClerkNotice | null>(null)
  const [isPending, setIsPending] = useState(false)
  // Bumped every time a Clerk step succeeded, so the effect below re-reads `signIn.status`; 0 = nothing pending.
  const [attempt, setAttempt] = useState(0)
  // Each submit starts a new flow; the refs remember which flow already sent its code / finalized, so a
  // re-render with the same status can't repeat either call.
  const [flow, setFlow] = useState(0)
  const codeRequestedFlow = useRef(0)
  const finalizedFlow = useRef(0)

  const status = signIn?.status

  useEffect(() => {
    if (!signIn || attempt === 0) return

    async function fail(message: ClerkNotice) {
      setNotice(message)
      setIsPending(false)
      setAttempt(0)
    }

    async function react() {
      if (!signIn) return
      if (status === 'complete') {
        if (finalizedFlow.current === flow) return
        finalizedFlow.current = flow
        const { error } = await signIn.finalize()
        if (error) {
          finalizedFlow.current = 0
          await fail(clerkNotice(error, GENERIC_ERROR))
          return
        }
        navigate('/home', { replace: true })
        return
      }
      if (status === 'needs_client_trust' || status === 'needs_second_factor') {
        if (codeRequestedFlow.current === flow) return
        codeRequestedFlow.current = flow
        const { error } = await signIn.mfa.sendEmailCode()
        if (error) {
          codeRequestedFlow.current = 0
          await fail(clerkNotice(error, GENERIC_ERROR))
          return
        }
        setStep('verify-device')
        setIsPending(false)
        return
      }
      if (status && status !== 'needs_identifier') {
        await fail({ tone: 'error', message: GENERIC_ERROR })
      }
    }
    void react()
  }, [signIn, status, attempt, flow, navigate])

  const onSubmit = handleSubmit(async (values) => {
    if (!signIn) return
    setNotice(null)
    setIsPending(true)
    setFlow((n) => n + 1)

    // A previous attempt that was abandoned (or a Google one) would still be on `signIn`.
    await signIn.reset()
    const { error } = await signIn.password({ emailAddress: values.email, password: values.password })
    if (error) {
      setNotice(clerkNotice(error, INVALID_CREDENTIALS_MESSAGE))
      setIsPending(false)
      return
    }
    setAttempt((n) => n + 1)
  })

  async function onSubmitCode(event: FormEvent) {
    event.preventDefault()
    if (!signIn) return
    setNotice(null)
    setIsPending(true)

    const { error } = await signIn.mfa.verifyEmailCode({ code })
    if (error) {
      setNotice(clerkNotice(error, INVALID_CODE_ERROR))
      setIsPending(false)
      return
    }
    // The status turns 'complete' on the next render; the effect above finalizes.
    setAttempt((n) => n + 1)
  }

  return { register, errors, onSubmit, isPending, notice, step, code, setCode, onSubmitCode }
}

export type LoginForm = ReturnType<typeof useLoginForm>
