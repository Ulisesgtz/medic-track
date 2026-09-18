import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAccountSession } from './useAccountSession'
import { fetchAccount, AccountApiError } from './api'
import { ChildCard } from './ChildCard'
import { AddChildModal } from './AddChildModal'
import { AppHeader } from '../../shared/ui/AppHeader'
import { Logo } from '../../shared/ui/Logo'

/**
 * The parent's home page: lists their children (FR-001), or an invitation to
 * create an account / add the first child (FR-002, FR-006). Reads the active
 * account id from useAccountSession and clears it if the account no longer
 * exists server-side (Caso Límite de spec.md).
 */
export function HomePage() {
  const { getAccountId, clearAccountId } = useAccountSession()
  const [accountId] = useState<string | null>(() => getAccountId())
  const [showAddChild, setShowAddChild] = useState(false)

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

  return (
    <main className="min-h-screen bg-canvas pb-16">
      <AppHeader title="Tus hijos" />

      <div className="mx-auto max-w-5xl px-5 py-7 md:px-10 md:py-9">
        {account && account.children.length === 0 ? (
          <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
            <p className="text-lg font-bold tracking-tight text-ink">
              Todavía no tienes hijos dados de alta
            </p>
            <p className="mt-2 text-base text-slate-600">Agrega al primero para empezar.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {account?.children.map((child) => (
              <ChildCard key={child.id} child={child} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowAddChild(true)}
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-hint-border px-5 py-5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
          Agregar hijo
        </button>
      </div>

      {showAddChild && accountId && (
        <AddChildModal accountId={accountId} onClose={() => setShowAddChild(false)} />
      )}
    </main>
  )
}
