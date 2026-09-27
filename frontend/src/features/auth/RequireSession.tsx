import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'

/**
 * Guards every route that needs a signed-in tutor (specs/008-autenticacion-cuenta):
 * sends a signed-out visitor to `/login` instead of rendering the page, and
 * shows a loading state while Clerk itself is still resolving whether there
 * is a session at all. This is the replacement for the old "no account_id
 * saved" branch each page used to render on its own.
 */
export function RequireSession({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </main>
    )
  }

  if (!isSignedIn) {
    return <Navigate to="/login" replace />
  }

  return children
}
