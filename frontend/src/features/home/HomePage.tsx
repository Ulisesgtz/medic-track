import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useLogout } from '../auth/useLogout'
import { MeApiError } from '../auth/api'
import { ChildCard } from './ChildCard'
import { AddChildDialogs } from './AddChildDialogs'
import { atFreePlanLimit } from './plan'
import { AppHeader } from '../../shared/ui/AppHeader'
import { AppShell } from './AppShell'
import { useSidebarSession } from './useSidebarSession'
import { Logo } from '../../shared/ui/Logo'
import { WelcomeDisclaimer } from './WelcomeDisclaimer'

/**
 * The parent's home page: lists their children (FR-001), or an invitation to
 * finish creating their account when their Clerk session has no PediTrack
 * account linked yet (FR-006, specs/008-autenticacion-cuenta — the session
 * itself is already verified, `RequireSession` only renders this page for a
 * signed-in tutor; this only covers the gap between signing up with Clerk
 * and finishing POST /accounts).
 *
 * Two separate designs, both from the delivered mockups: the phone list (dark
 * header "Tus hijos", dashed "+ Agregar hijo" and the plan note) and, on the
 * web (mock 15, with the sidebar), "Hola, Ana / Tus hijos" with a solid
 * "Agregar hijo" button, the children grid and the dashed plan tile.
 */
export function HomePage() {
  const [showAddChild, setShowAddChild] = useState(false)
  const addChildButton = useRef<HTMLButtonElement>(null)
  const { isDesktop } = useSidebarSession()
  const logout = useLogout()

  const query = useCurrentAccount()

  const accountNotFound =
    query.isError && query.error instanceof MeApiError && query.error.kind === 'not_found_for_session'

  if (accountNotFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-xl">
          <div className="flex justify-center">
            <Logo size={56} variant="light" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">
            Falta terminar tu registro
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Ya iniciaste sesión, pero todavía no completas los datos de tu cuenta en PediTrack.
          </p>
          <Link
            to="/registro/completar"
            className="mt-7 block cursor-pointer rounded-2xl bg-confirmed px-6 py-4 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800"
          >
            Terminar registro
          </Link>
          <button
            type="button"
            onClick={logout}
            className="mt-4 cursor-pointer text-sm font-bold text-action hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    )
  }

  if (query.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-xl">
          <div className="flex justify-center">
            <Logo size={56} variant="light" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">No pudimos cargar tu cuenta</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Puede ser un problema de conexión o que tu sesión haya caducado. Tus datos siguen guardados.
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-7 block min-h-11 w-full cursor-pointer rounded-2xl bg-confirmed px-6 py-4 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={logout}
            className="mt-4 cursor-pointer text-sm font-bold text-action hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    )
  }

  const accountId = query.data?.id ?? null

  if (query.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </main>
    )
  }

  const account = query.data
  const children = account?.children ?? []
  const atLimit = account ? atFreePlanLimit(account) : false

  const dialogs = (
    <AddChildDialogs
      accountId={accountId!}
      account={account}
      open={showAddChild}
      onClose={() => setShowAddChild(false)}
      showChildName={isDesktop}
      opener={addChildButton}
    />
  )

  const emptyState = (
    <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <p className="text-lg font-bold tracking-tight text-ink">Todavía no tienes hijos dados de alta</p>
      <p className="mt-2 text-base text-slate-600">Agrega al primero para empezar.</p>
    </div>
  )

  if (isDesktop) {
    return (
      <AppShell>
        <main className="min-h-screen min-w-0 bg-canvas px-6 py-8 lg:px-12 lg:py-11">
          <div className="mx-auto flex max-w-4xl flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {account && <p className="text-sm font-bold text-action">Hola, {account.firstName}</p>}
                <h1 className="mt-1 text-4xl font-black tracking-tight text-ink">Tus hijos</h1>
              </div>
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={logout}
                  className="cursor-pointer text-sm font-bold text-action hover:underline"
                >
                  Cerrar sesión
                </button>
                <button
                  ref={addChildButton}
                  type="button"
                  onClick={() => setShowAddChild(true)}
                  className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-[15px] font-extrabold text-white transition-colors hover:bg-emerald-800"
                >
                  Agregar hijo
                </button>
              </div>
            </div>

            <WelcomeDisclaimer />

            {children.length === 0 ? (
              emptyState
            ) : (
              <div className="grid grid-cols-2 gap-5">
                {children.map((child) => (
                  <ChildCard key={child.id} child={child} variant="desktop" />
                ))}
                {atLimit && (
                  <div className="flex min-w-0 items-center justify-center rounded-3xl border-2 border-dashed border-hint-border p-6 text-center text-[15px] font-extrabold text-action">
                    Tu plan incluye un hijo
                  </div>
                )}
              </div>
            )}
          </div>
          {dialogs}
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-16">
        <AppHeader
          eyebrow={account ? `Hola, ${account.firstName}` : undefined}
          title="Tus hijos"
          action={
            account && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={logout}
                  className="cursor-pointer text-[13px] font-bold text-[#67e8f9] hover:underline"
                >
                  Cerrar sesión
                </button>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-action text-sm font-extrabold text-white"
                >
                  {account.firstName.charAt(0)}
                  {account.lastName.charAt(0)}
                </span>
              </div>
            )
          }
        />

        <div className="px-6 pt-6">
          <div className="empty:hidden [&:not(:empty)]:mb-4">
            <WelcomeDisclaimer />
          </div>
          {children.length === 0 ? (
            emptyState
          ) : (
            <div className="flex flex-col gap-4">
              {children.map((child, index) => (
                <ChildCard key={child.id} child={child} variant="phone" index={index} />
              ))}
            </div>
          )}

          <button
            ref={addChildButton}
            type="button"
            onClick={() => setShowAddChild(true)}
            className="mt-4 min-h-11 w-full cursor-pointer rounded-3xl border-2 border-dashed border-[#67e8f9] py-5 text-base font-extrabold text-action transition-colors hover:bg-hint"
          >
            + Agregar hijo
          </button>
          {account?.plan === 'free' && (
            <p className="mt-4 text-center text-[13px] text-slate-500">El plan gratuito incluye un hijo.</p>
          )}
        </div>
        {dialogs}
      </main>
    </AppShell>
  )
}
