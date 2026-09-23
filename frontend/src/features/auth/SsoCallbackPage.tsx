import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClerk, useSignIn, useSignUp } from '@clerk/react'
import { clerkNotice } from '../../shared/auth/clerkMessages'
import { MessagePage } from '../../shared/ui/MessagePage'

/**
 * Where Google sends the browser back after the consent screen
 * (`GoogleSignupButton`'s `redirectCallbackUrl`). Clerk already resolved the
 * OAuth exchange by the time this mounts — this page's only job is to look
 * at what `signIn`/`signUp` ended up as and decide where the tutor goes next
 * (specs/008-autenticacion-cuenta, research.md punto 1):
 *
 * - `signIn.status === 'complete'` → a returning tutor → `/home`.
 * - `signIn.isTransferable` → no Clerk user matched this Google identity →
 *   transfer it to a new `signUp` (`signUp.create({ transfer: true })`) and,
 *   once that completes, finalize it and go to `/registro/completar` (Google
 *   gives no tutor/child data, so the PediTrack account still isn't created).
 * - an `existingSession` on either → the browser already had a session before
 *   this flow started → activate it directly instead of finalizing.
 *
 * `signUp.isTransferable` is the opposite case (a sign-*up* attempt whose
 * identifier already matches an existing user, transferable to a sign-*in*)
 * and never applies here since this flow only ever starts from `signIn.sso()`.
 */
export function SsoCallbackPage() {
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn()
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp()
  const clerk = useClerk()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !signIn || !signUp) return
    // Right after Clerk redirects back here, `signIn`/`signUp` can still be their
    // blank pre-fetch defaults (status 'needs_identifier'/'missing_requirements',
    // isTransferable false) while the real OAuth result is still being fetched from
    // Clerk's API — resolving from that snapshot always misses it. Wait for both
    // fetches to settle; the effect re-runs on its own once they do (signIn/signUp
    // are signal-based and change reference on every update).
    if (signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching') return
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
          setError(clerkNotice(finalizeError, 'No se pudo iniciar sesión con Google. Intenta de nuevo.').message)
          return
        }
        navigate('/home', { replace: true })
        return
      }
      if (signIn.isTransferable) {
        const { error: transferError } = await signUp.create({ transfer: true })
        if (transferError) {
          setError(clerkNotice(transferError, 'No se pudo continuar el registro con Google. Intenta de nuevo.').message)
          return
        }
        // Don't trust this render's `signUp` snapshot for the post-create status: the
        // hook only hands us a new object on the next render, so `signUp.status` here
        // would still read whatever it was *before* create() ran. finalize() talks to
        // the live resource regardless, and reports its own error if it truly isn't done.
        const { error: finalizeError } = await signUp.finalize()
        if (finalizeError) {
          setError(clerkNotice(finalizeError, 'No se pudo continuar el registro con Google. Intenta de nuevo.').message)
          return
        }
        navigate('/registro/completar', { replace: true })
        return
      }
      setError('No se pudo completar el inicio de sesión con Google. Intenta de nuevo.')
    }

    resolve()
  }, [signIn, signUp, signInFetchStatus, signUpFetchStatus, clerk, navigate])

  if (error) {
    return <MessagePage title="No se pudo continuar" message={error} to="/signup" linkLabel="Volver al registro" />
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <p className="text-base font-semibold text-action">Iniciando sesión…</p>
    </main>
  )
}
