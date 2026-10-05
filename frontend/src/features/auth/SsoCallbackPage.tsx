import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useClerk, useSignIn, useSignUp } from '@clerk/react'
import { clerkNotice } from '../../shared/auth/clerkMessages'
import { MessagePage } from '../../shared/ui/MessagePage'

/**
 * Where Google sends the browser back after the consent screen
 * (`GoogleSignupButton`'s `redirectCallbackUrl`). Clerk already resolved the
 * OAuth exchange by the time this mounts — this page's only job is to look
 * at what `signIn`/`signUp` ended up as and decide where the tutor goes next
 * (specs/008-autenticacion-cuenta, research.md punto 1). Same order of checks as
 * Clerk's own `HandleSSOCallback`, with PediTrack's destinations:
 *
 * - `signIn.status === 'complete'` → a returning tutor → `/home`.
 * - a sign-in that still needs a factor (new device, second factor…) → `/login`,
 *   which knows how to ask for it.
 * - `signIn.isTransferable` → no Clerk user matched this Google identity →
 *   transfer it to a new `signUp` (`signUp.create({ transfer: true })`) and,
 *   once that completes, finalize it and go to `/registro/completar` (Google
 *   gives no tutor/child data, so the PediTrack account still isn't created).
 * - an `existingSession` on either → the browser already had a session before
 *   this flow started → activate it directly instead of finalizing.
 *
 * Nothing is decided before Clerk has **loaded**: until then `signIn`/`signUp` are
 * blank placeholders (status `needs_identifier`, not transferable, fetch status
 * `idle`), and resolving from them sent every brand-new Google tutor to the
 * "No se pudo continuar" page. The `clerk-captcha` element is where Clerk's bot
 * protection draws its challenge if the transfer to a sign-up needs one.
 */
export function SsoCallbackPage() {
  const { isLoaded } = useAuth()
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn()
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp()
  const clerk = useClerk()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !isLoaded || !signIn || !signUp) return
    // Even once loaded, wait for any in-flight fetch of signIn/signUp to settle; the effect
    // re-runs on its own when it does (they are signal-based and change reference on every update).
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
      if (
        signIn.status === 'needs_second_factor' ||
        signIn.status === 'needs_client_trust' ||
        signIn.status === 'needs_new_password'
      ) {
        navigate('/login', { replace: true })
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
      if (signUp.status === 'complete') {
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
  }, [isLoaded, signIn, signUp, signInFetchStatus, signUpFetchStatus, clerk, navigate])

  if (error) {
    return <MessagePage title="No se pudo continuar" message={error} to="/signup" linkLabel="Volver al registro" />
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-5 py-10">
      <p className="text-base font-semibold text-action">Iniciando sesión…</p>
      <div id="clerk-captcha" />
    </main>
  )
}
