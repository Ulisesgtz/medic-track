import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/react'
import { clerkNotice, hasClerkCode, type ClerkNotice } from '../../shared/auth/clerkMessages'

const GENERIC_ERROR = 'No se pudo cambiar la contraseña. Intenta de nuevo.'
const INVALID_CODE_ERROR = 'El código no es correcto. Revisa tu correo e intenta de nuevo.'

/**
 * Password recovery (specs/008-autenticacion-cuenta): the tutor gives their
 * correo, Clerk emails a code, and with that code they choose a new password
 * (which also signs them in). Two steps, each with its own small form.
 *
 * Asking for the code never reveals whether the correo has an account (same
 * spirit as FR-009): an unknown correo goes to the code step exactly like a
 * known one — the code just never arrives. Like the login, the final
 * `'complete'` status is reacted to on the next render (`attempt` counter),
 * not read right after the `await`.
 */
export function useForgotPassword() {
  const emailForm = useForm<{ email: string }>({ defaultValues: { email: '' } })
  const resetForm = useForm<{ code: string; password: string }>({ defaultValues: { code: '', password: '' } })
  const password = useWatch({ control: resetForm.control, name: 'password' })

  const { signIn } = useSignIn()
  const navigate = useNavigate()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [notice, setNotice] = useState<ClerkNotice | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [flow, setFlow] = useState(0)
  const finalizedFlow = useRef(0)

  const status = signIn?.status

  useEffect(() => {
    if (!signIn || attempt === 0 || status !== 'complete' || finalizedFlow.current === flow) return
    finalizedFlow.current = flow
    void (async () => {
      const { error } = await signIn.finalize()
      if (error) {
        finalizedFlow.current = 0
        setNotice(clerkNotice(error, GENERIC_ERROR))
        setIsPending(false)
        setAttempt(0)
        return
      }
      navigate('/home', { replace: true })
    })()
  }, [signIn, status, attempt, flow, navigate])

  const onSubmitEmail = emailForm.handleSubmit(async ({ email }) => {
    if (!signIn) return
    setNotice(null)
    setIsPending(true)

    await signIn.reset()
    const created = await signIn.create({ identifier: email })
    if (created.error && !hasClerkCode(created.error, 'form_identifier_not_found')) {
      setNotice(clerkNotice(created.error, GENERIC_ERROR))
      setIsPending(false)
      return
    }
    if (!created.error) {
      const sent = await signIn.resetPasswordEmailCode.sendCode()
      if (sent.error) {
        setNotice(clerkNotice(sent.error, GENERIC_ERROR))
        setIsPending(false)
        return
      }
    }
    setStep('code')
    setIsPending(false)
  })

  const onSubmitReset = resetForm.handleSubmit(async ({ code, password: newPassword }) => {
    if (!signIn) return
    setNotice(null)
    setIsPending(true)
    setFlow((n) => n + 1)

    const verified = await signIn.resetPasswordEmailCode.verifyCode({ code })
    if (verified.error) {
      setNotice(clerkNotice(verified.error, INVALID_CODE_ERROR))
      setIsPending(false)
      return
    }
    const submitted = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword })
    if (submitted.error) {
      setNotice(clerkNotice(submitted.error, GENERIC_ERROR))
      setIsPending(false)
      return
    }
    setAttempt((n) => n + 1)
  })

  return { emailForm, resetForm, password, step, notice, isPending, onSubmitEmail, onSubmitReset }
}
