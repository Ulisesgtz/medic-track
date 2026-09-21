import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatAgeShort } from '../../shared/age'
import { Logo } from '../../shared/ui/Logo'
import { fetchAccount } from './api'
import { AddChildDialogs } from './AddChildDialogs'

interface ChildrenSidebarProps {
  accountId: string
  /** The child whose screen is open, highlighted in the list. */
  activeChildId?: string
}

/**
 * Persistent children list for desktop (≥ 900px, FR-012), built from the
 * delivered desktop mockups (12–15): 280px ink column with the logo, one row
 * per child (first name + short age, the open one in --color-action), a dashed
 * "+ Agregar hijo" and the tutor with the plan at the bottom. Reads the same
 * ['account', id] query the home uses, so it costs no extra request.
 */
export function ChildrenSidebar({ accountId, activeChildId }: ChildrenSidebarProps) {
  const [showAddChild, setShowAddChild] = useState(false)
  const addChildButton = useRef<HTMLButtonElement>(null)
  const query = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => fetchAccount(accountId),
    retry: false,
  })
  const account = query.data

  return (
    <aside className="sticky top-0 flex h-screen w-[280px] shrink-0 flex-col gap-8 overflow-y-auto bg-ink px-6 py-7">
      <Link to="/home" className="-my-[5px] flex min-h-11 items-center gap-2.5" aria-label="PediTrack — ir a mi home">
        <Logo size={34} />
        <span className="text-lg font-black tracking-tight text-white">
          Pedi<span className="text-[#67e8f9]">Track</span>
        </span>
      </Link>

      <nav aria-label="Tus hijos" className="flex flex-col gap-2.5">
        {account?.children.map((child) => {
          const isActive = child.id === activeChildId
          return (
            <Link
              key={child.id}
              to={`/children/${child.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-200 ${
                isActive ? 'bg-action' : 'hover:bg-ink-soft'
              }`}
            >
              <span
                className={`min-w-0 truncate text-base ${isActive ? 'font-extrabold text-white' : 'font-bold text-[#a5f3fc]'}`}
              >
                {child.firstName}
              </span>
              {/* Inactive age: #62909d (the mock's #5b8b94 is 4.3:1 on ink, under the 4.5:1 minimum). */}
              <span className={`shrink-0 text-[13px] font-semibold ${isActive ? 'text-[#cffafe]' : 'text-[#62909d]'}`}>
                {formatAgeShort(child.birthDate)}
              </span>
            </Link>
          )
        })}

        <button
          ref={addChildButton}
          type="button"
          onClick={() => setShowAddChild(true)}
          className="cursor-pointer rounded-2xl border-[1.5px] border-dashed border-[#0b5763] px-4 py-3.5 text-center text-sm font-bold text-[#67e8f9] transition-colors duration-200 hover:bg-ink-soft"
        >
          + Agregar hijo
        </button>
      </nav>

      {account && (
        <div className="mt-auto flex items-center gap-3 border-t border-ink-soft pt-5">
          <span
            aria-hidden="true"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-action text-sm font-extrabold text-white"
          >
            {account.firstName.charAt(0)}
            {account.lastName.charAt(0)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-white">
              {account.firstName} {account.lastName}
            </span>
            <span className="block text-xs text-[#67e8f9]">
              {account.plan === 'free' ? 'Plan gratuito' : 'Plan completo'}
            </span>
          </span>
        </div>
      )}

      <AddChildDialogs
        accountId={accountId}
        account={account}
        open={showAddChild}
        onClose={() => setShowAddChild(false)}
        showChildName
        opener={addChildButton}
      />
    </aside>
  )
}
