import { useRef, useState } from 'react'
import { Link, useMatch } from 'react-router-dom'
import { formatAgeShort } from '../../shared/age'
import { Logo } from '../../shared/ui/Logo'
import { useLogout } from '../auth/useLogout'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { AddChildDialogs } from './AddChildDialogs'
import { addChildTarget } from './plan'
import { usePersonalRoutines } from '../supplements/hooks'
import { useLocalDay } from '../../shared/useLocalDay'

interface ChildrenSidebarProps {
  /** The child whose screen is open, highlighted in the list. */
  activeChildId?: string
}

/**
 * Persistent children list for desktop (≥ 900px, FR-012), built from the
 * delivered desktop mockups (12–15): 280px ink column with the logo, one row
 * per child (first name + short age, the open one in --color-action), a dashed
 * "+ Agregar hijo" and the tutor with the plan at the bottom. Reads the same
 * ['accounts', 'me'] query the home uses, so it costs no extra request.
 */
export function ChildrenSidebar({ activeChildId }: ChildrenSidebarProps) {
  const [showAddChild, setShowAddChild] = useState(false)
  const addChildButton = useRef<HTMLButtonElement>(null)
  const logout = useLogout()
  const query = useCurrentAccount()
  const account = query.data
  const onFamilyPage = useMatch('/familia') !== null
  const onPlansPage = useMatch('/planes') !== null
  // Specs/033, part 3: the person's own section, apart from the children; its count comes from the same query the home uses.
  const onPersonalPage = useMatch('/mis-suplementos/*') !== null
  const personalCount = usePersonalRoutines(account?.id, useLocalDay(), { poll: false }).data?.activeCount ?? 0

  return (
    <aside className="sticky top-0 flex h-screen w-[280px] shrink-0 flex-col gap-8 overflow-y-auto bg-ink px-6 py-7">
      <Link to="/home" className="-my-[5px] flex min-h-11 items-center gap-2.5" aria-label="PediTrack — ir a mi home">
        <Logo size={34} />
        <span className="text-lg font-black tracking-tight text-white">
          Pedi<span className="text-bright-soft">Track</span>
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
                className={`min-w-0 truncate text-base ${isActive ? 'font-extrabold text-white' : 'font-bold text-hint-border'}`}
              >
                {child.firstName}
              </span>
              {/* Inactive age: #62909d (the mock's #5b8b94 is 4.3:1 on ink, under the 4.5:1 minimum). */}
              <span className={`shrink-0 text-[13px] font-semibold ${isActive ? 'text-hint-edge' : 'text-ink-muted'}`}>
                {formatAgeShort(child.birthDate)}
              </span>
            </Link>
          )
        })}

        {(!account || addChildTarget(account).allowed) && (
          <button
            ref={addChildButton}
            type="button"
            onClick={() => setShowAddChild(true)}
            className="cursor-pointer rounded-2xl border-[1.5px] border-dashed border-ink-edge px-4 py-3.5 text-center text-sm font-bold text-bright-soft transition-colors duration-200 hover:bg-ink-soft"
          >
            + Agregar hijo
          </button>
        )}
      </nav>

      {/* Specs/032 («Familia» mock): below the children, active on its own page. */}
      <Link
        to="/familia"
        aria-current={onFamilyPage ? 'page' : undefined}
        className={`flex min-h-12 items-center justify-between rounded-2xl px-4 transition-colors duration-200 ${
          onFamilyPage ? 'bg-action' : 'hover:bg-ink-soft'
        }`}
      >
        <span className={`text-base font-extrabold ${onFamilyPage ? 'text-white' : 'text-hint-border'}`}>Familia</span>
      </Link>

      {account && (
        <nav aria-label="Personal" className="flex flex-col gap-2.5 border-t border-ink-edge pt-5">
          <p className="px-4 text-xs font-extrabold tracking-[0.1em] text-ink-muted uppercase">Personal</p>
          <Link
            to="/mis-suplementos"
            aria-current={onPersonalPage ? 'page' : undefined}
            className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 transition-colors duration-200 ${
              onPersonalPage ? 'bg-action' : 'hover:bg-ink-soft'
            }`}
          >
            <span className={`text-base font-extrabold ${onPersonalPage ? 'text-white' : 'text-hint-border'}`}>Mis suplementos</span>
            {personalCount > 0 && (
              <span className={`shrink-0 text-[13px] font-semibold ${onPersonalPage ? 'text-hint-edge' : 'text-ink-muted'}`}>
                {personalCount} {personalCount === 1 ? 'activa' : 'activas'}
              </span>
            )}
          </Link>
        </nav>
      )}

      {account && (
        <div className="mt-auto flex flex-col gap-3 border-t border-ink-soft pt-5">
          <div className="flex items-center gap-3">
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
              <span className="block text-xs text-bright-soft">
                {(account.family?.plan ?? account.plan) === 'free' ? 'Plan gratuito' : 'Plan completo'}
              </span>
            </span>
          </div>
          {/* Specs/034: a fixed way to the plans. */}
          <Link
            to="/planes"
            aria-current={onPlansPage ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-2xl px-4 text-[15px] font-extrabold transition-colors duration-200 ${
              onPlansPage ? 'bg-action text-white' : 'text-hint-border hover:bg-ink-soft'
            }`}
          >
            Planes
          </Link>
          <button
            type="button"
            onClick={logout}
            className="cursor-pointer self-start text-xs font-bold text-bright-soft hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      )}

      <AddChildDialogs
        account={account}
        open={showAddChild}
        onClose={() => setShowAddChild(false)}
        opener={addChildButton}
      />
    </aside>
  )
}
