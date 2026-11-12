import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { OfflineGate } from '../../shared/offline/OfflineGate'
import { useOfflineSession } from '../../shared/offline/offlineSession'

/**
 * Guards every route that needs a signed-in tutor (specs/008-autenticacion-cuenta):
 * sends a signed-out visitor to `/login` instead of rendering the page, and
 * shows a loading state while Clerk itself is still resolving whether there
 * is a session at all. This is the replacement for the old "no account_id
 * saved" branch each page used to render on its own.
 *
 * Without a network (specs/067) Clerk can't confirm the session: the installed phone shows its copy of the last owner's data
 * (`offline`), and with no copy the app says it needs a connection (`gate`) — never the login, which can't work offline either.
 */
export function RequireSession({ children }: PropsWithChildren) {
  const { isSignedIn } = useAuth()
  const mode = useOfflineSession()
  if (mode === 'offline') return children
  if (mode === 'gate') return <OfflineGate />
  if (mode === 'loading') {
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
