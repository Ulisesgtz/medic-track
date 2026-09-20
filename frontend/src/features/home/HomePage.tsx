import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAccountSession } from './useAccountSession'
import { fetchAccount, AccountApiError } from './api'
import { ChildCard } from './ChildCard'
import { AddChildDialogs } from './AddChildDialogs'
import { atFreePlanLimit } from './plan'
import { AppHeader } from '../../shared/ui/AppHeader'
import { AppShell } from './AppShell'
import { useSidebarSession } from './useSidebarSession'
import { Logo } from '../../shared/ui/Logo'

/**
 * The parent's home page: lists their children (FR-001), or an invitation to
 * create an account / add the first child (FR-002, FR-006). Reads the active
 * account id from useAccountSession and clears it if the account no longer
 * exists server-side (Caso Límite de spec.md).
 *
 * Two separate designs, both from the delivered mockups: the phone list (dark
 * header "Tus hijos", dashed "+ Agregar hijo" and the plan note) and, on the
 * web (mock 15, with the sidebar), "Hola, Ana / Tus hijos" with a solid
 * "Agregar hijo" button, the children grid and the dashed plan tile.
 */
export function HomePage() {
  const { getAccountId, clearAccountId } = useAccountSession()
  const [accountId] = useState<string | null>(() => getAccountId())
  const [showAddChild, setShowAddChild] = useState(false)
  const { isDesktop } = useSidebarSession()

  const query = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => fetchAccount(accountId!),
    enabled: accountId !== null,
    retry: false,
  })

  const accountNotFound =
    query.isError && query.error instanceof AccountApiError && query.error.kind === 'not_found'

  // Side effect only (no React state to update here) — the "no account"
  // render branch below already derives itself from accountNotFound, so a
  // stale accountId just needs clearing from storage for the *next* visit.
  useEffect(() => {
    if (accountNotFound) {
      clearAccountId()
    }
  }, [accountNotFound, clearAccountId])

  if (accountId === null || accountNotFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-xl">
          <div className="flex justify-center">
            <Logo size={56} variant="light" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">
            Bienvenido a PediTrack
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Todavía no tienes una cuenta guardada en este navegador.
          </p>
          <Link
            to="/signup"
            className="mt-7 block cursor-pointer rounded-2xl bg-confirmed px-6 py-4 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800"
          >
            Crear cuenta
          </Link>
        </div>
      </main>
    )
  }

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
      accountId={accountId}
      account={account}
      open={showAddChild}
      onClose={() => setShowAddChild(false)}
      showChildName={isDesktop}
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
        <main className="min-h-screen min-w-0 bg-canvas px-12 py-11">
          <div className="mx-auto flex max-w-4xl flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {account && <p className="text-sm font-bold text-action">Hola, {account.firstName}</p>}
                <h1 className="mt-1 text-4xl font-black tracking-tight text-ink">Tus hijos</h1>
              </div>
              <button
                type="button"
                onClick={() => setShowAddChild(true)}
                className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-[15px] font-extrabold text-white transition-colors hover:bg-emerald-800"
              >
                Agregar hijo
              </button>
            </div>

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
      <main className="min-h-screen bg-canvas pb-16">
        <AppHeader
          eyebrow={account ? `Hola, ${account.firstName}` : undefined}
          title="Tus hijos"
          action={
            account && (
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-action text-sm font-extrabold text-white"
              >
                {account.firstName.charAt(0)}
                {account.lastName.charAt(0)}
              </span>
            )
          }
        />

        <div className="px-6 pt-6">
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
