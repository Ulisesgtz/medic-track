import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAccountSession } from './useAccountSession'
import { fetchAccount, AccountApiError } from './api'
import { ChildCard } from './ChildCard'
import { AddChildModal } from './AddChildModal'

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
      <main className="flex min-h-screen items-center justify-center bg-cyan-50 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-md">
          <h1 className="text-xl font-semibold text-slate-900">Bienvenido a PediTrack</h1>
          <p className="mt-2 text-sm text-slate-500">
            Todavía no tienes una cuenta guardada en este navegador.
          </p>
          <Link
            to="/signup"
            className="mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-emerald-700"
          >
            Crear cuenta
          </Link>
        </div>
      </main>
    )
  }

  if (query.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cyan-50 px-4 py-8">
        <p className="text-sm text-slate-500">Cargando…</p>
      </main>
    )
  }

  const account = query.data

  return (
    <main className="min-h-screen bg-cyan-50 px-4 py-8 md:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Mis hijos</h1>
          <button
            type="button"
            onClick={() => setShowAddChild(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 transition-colors duration-200 hover:bg-cyan-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
            </svg>
            Agregar hijo
          </button>
        </div>

        {account && account.children.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              Todavía no tienes hijos dados de alta. Agrega al primero para empezar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {account?.children.map((child) => (
              <ChildCard key={child.id} child={child} />
            ))}
          </div>
        )}
      </div>

      {showAddChild && accountId && (
        <AddChildModal accountId={accountId} onClose={() => setShowAddChild(false)} />
      )}
    </main>
  )
}
