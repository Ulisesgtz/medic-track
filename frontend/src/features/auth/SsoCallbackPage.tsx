import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClerk, useSignIn, useSignUp } from '@clerk/react'
import { MessagePage } from '../../shared/ui/MessagePage'

/**
 * Where Google sends the browser back after the consent screen
 * (`GoogleSignupButton`'s `redirectCallbackUrl`). Clerk already resolved the
 * OAuth exchange by the time this mounts — this page's only job is to look
 * at what `signIn`/`signUp` ended up as and decide where the tutor goes next
 * (specs/008-autenticacion-cuenta, research.md punto 1):
 *
 * - `signIn.status === 'complete'` → a returning tutor → `/home`.
 * - `signUp.isTransferable` → a brand-new Google identity → `/registro/completar`
 *   (Google gives no tutor/child data, so the account still isn't created).
 * - an `existingSession` on either → the browser already had a session before
 *   this flow started → activate it directly instead of finalizing.
 */
export function SsoCallbackPage() {
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  const clerk = useClerk()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !signIn || !signUp) return
    ran.current = true

    async function resolve() {
      if (signIn.existingSession) {
        await clerk.setActive({ session: signIn.existingSession.sessionId })
        navigate('/home', { replace: true })
        return
      }
      if (signUp.existingSession) {
        await clerk.setActive({ session: signUp.existingSession.sessionId })
        navigate('/home', { replace: true })
        return
      }
      if (signIn.status === 'complete') {
        const { error: finalizeError } = await signIn.finalize()
        if (finalizeError) {
          setError(finalizeError.message ?? 'No se pudo iniciar sesión con Google. Intenta de nuevo.')
          return
        }
        navigate('/home', { replace: true })
        return
      }
      if (signUp.isTransferable) {
        const { error: finalizeError } = await signUp.finalize()
        if (finalizeError) {
          setError(finalizeError.message ?? 'No se pudo continuar el registro con Google. Intenta de nuevo.')
          return
        }
        navigate('/registro/completar', { replace: true })
        return
      }
      setError('No se pudo completar el inicio de sesión con Google. Intenta de nuevo.')
    }

    resolve()
  }, [signIn, signUp, clerk, navigate])

  if (error) {
    return <MessagePage title="No se pudo continuar" message={error} to="/signup" linkLabel="Volver al registro" />
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <p className="text-base font-semibold text-action">Iniciando sesión…</p>
    </main>
  )
}
