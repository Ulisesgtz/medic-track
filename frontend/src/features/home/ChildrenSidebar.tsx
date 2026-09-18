import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatAgeShort } from '../../shared/age'
import { Logo } from '../../shared/ui/Logo'
import { fetchAccount } from './api'
import { AddChildModal } from './AddChildModal'

interface ChildrenSidebarProps {
  accountId: string
  /** The child whose screen is open, highlighted in the list. */
  activeChildId?: string
}

/**
 * Persistent children list for desktop (≥ 1024px, FR-012): switch between
 * children without going back to the home. Reads the same ['account', id]
 * query the home page uses, so it costs no extra request.
 */
export function ChildrenSidebar({ accountId, activeChildId }: ChildrenSidebarProps) {
  const [showAddChild, setShowAddChild] = useState(false)
  const query = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => fetchAccount(accountId),
    retry: false,
  })
  const account = query.data

  return (
    <aside className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto bg-ink p-6">
      <Link to="/home" className="flex min-h-11 items-center gap-2.5" aria-label="PediTrack — ir a mi home">
        <Logo size={36} />
        <span className="text-xl font-black tracking-tight text-white">
          Pedi<span className="text-bright">Track</span>
        </span>
      </Link>

      <nav aria-label="Tus hijos" className="flex flex-1 flex-col gap-2">
        {account?.children.map((child) => {
          const isActive = child.id === activeChildId
          return (
            <Link
              key={child.id}
              to={`/children/${child.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 py-2 transition-colors duration-200 ${
                isActive ? 'bg-action' : 'hover:bg-ink-soft'
              }`}
            >
              <span className="min-w-0 truncate text-base font-extrabold tracking-tight text-white">
                {child.firstName} {child.lastName}
              </span>
              <span
                className={`shrink-0 text-sm font-bold ${isActive ? 'text-white' : 'text-white/70'}`}
              >
                {formatAgeShort(child.birthDate)}
              </span>
            </Link>
          )
        })}

        <button
          type="button"
          onClick={() => setShowAddChild(true)}
          className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-bright/40 px-4 py-2 text-sm font-bold text-bright transition-colors duration-200 hover:bg-ink-soft"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
          </svg>
          Agregar hijo
        </button>
      </nav>

      {account && (
        <div className="flex items-center gap-3 border-t border-white/15 pt-4">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-action text-sm font-black text-white"
          >
            {account.firstName.charAt(0)}
            {account.lastName.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-white">
              {account.firstName} {account.lastName}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-bright">
              {account.plan === 'free' ? 'Plan gratuito' : 'Plan completo'}
            </p>
          </div>
        </div>
      )}

      {showAddChild && <AddChildModal accountId={accountId} onClose={() => setShowAddChild(false)} />}
    </aside>
  )
}
