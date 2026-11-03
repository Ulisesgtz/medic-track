import { PROFILE, sharedEntry } from '../profile/profileText'
import { useRef, useState } from 'react'
import { Link, useMatch } from 'react-router-dom'
import { formatAgeShort } from '../../shared/age'
import { Logo } from '../../shared/ui/Logo'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { AccountMenu } from './AccountMenu'
import { AddChildDialogs } from './AddChildDialogs'
import { HOME, familyOf } from './homeText'
import { addChildTarget, onlySharedChildren } from './plan'

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
  const query = useCurrentAccount()
  const account = query.data
  const onHome = useMatch('/home') !== null
  const onFamilyPage = useMatch('/familia') !== null
  const onPlansPage = useMatch('/planes') !== null
  // Specs/033 part 3, 056 and 058: the person's own profile, apart from the children — one entry, «Mi perfil».
  const onMyDay = [useMatch('/yo/*'), useMatch('/mis-suplementos/*'), useMatch('/mis-actividades/*')].some((m) => m !== null)
  const onShared = useMatch('/personas/:accountId/*')?.params.accountId
  // Every child is shared with the session (none of its own): the group is named after the family.
  const groupLabel = onlySharedChildren(account) ? (account?.family ? familyOf(account.family.ownerName) : HOME.sharedTitle) : HOME.childrenTitle

  return (
    <aside className="sticky top-0 flex h-screen w-[280px] shrink-0 flex-col gap-8 overflow-y-auto bg-ink px-6 py-7">
      <Link to="/home" className="-my-[5px] flex min-h-11 items-center gap-2.5" aria-label="PediTrack — ir a mi home">
        <Logo size={34} />
        <span className="text-lg font-black tracking-tight text-white">
          Pedi<span className="text-bright-soft">Track</span>
        </span>
      </Link>

      {/* The design's «Inicio» (Inicio · hijos · Personal): a fixed way back to the home, active on it. */}
      <Link
        to="/home"
        aria-current={onHome ? 'page' : undefined}
        className={`-mt-3 flex min-h-12 items-center rounded-2xl px-4 transition-colors duration-200 ${onHome ? 'bg-action' : 'hover:bg-ink-soft'}`}
      >
        <span className={`text-base font-extrabold ${onHome ? 'text-white' : 'text-hint-border'}`}>Inicio</span>
      </Link>

      <nav aria-label="Tus hijos" className="flex flex-col gap-2.5">
        {/* Specs/055: the group's name, as in the design («Tus hijos», or the family whose children the session only sees). */}
        <p className="px-4 pt-1 text-xs font-extrabold tracking-[0.08em] text-bright-soft uppercase">{groupLabel}</p>
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
            to="/yo"
            aria-current={onMyDay ? 'page' : undefined}
            className={`flex min-h-12 items-center rounded-2xl px-4 transition-colors duration-200 ${onMyDay ? 'bg-action' : 'hover:bg-ink-soft'}`}
          >
            <span className={`text-base font-extrabold ${onMyDay ? 'text-white' : 'text-hint-border'}`}>{PROFILE.sidebar}</span>
          </Link>
          {/* Specs/058: somebody of the family who shares their own consultations with the session. */}
          {account.sharedProfiles?.map((p) => {
            const active = onShared === p.accountId
            return (
              <Link
                key={p.accountId}
                to={`/personas/${p.accountId}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 items-center rounded-2xl px-4 transition-colors duration-200 ${active ? 'bg-action' : 'hover:bg-ink-soft'}`}
              >
                <span className={`text-base font-extrabold ${active ? 'text-white' : 'text-hint-border'}`}>{sharedEntry(p.firstName)}</span>
              </Link>
            )
          })}
        </nav>
      )}

      {account && (
        <div className="mt-auto flex flex-col gap-3">
          {/* Specs/034: a fixed way to the plans (the sidebar is on every screen, not only on the home). */}
          <Link
            to="/planes"
            aria-current={onPlansPage ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-2xl px-4 text-[15px] font-extrabold transition-colors duration-200 ${
              onPlansPage ? 'bg-action text-white' : 'text-hint-border hover:bg-ink-soft'
            }`}
          >
            Planes
          </Link>
          {/* Specs/055: the account opens its menu, where «Cerrar sesión» is. */}
          <AccountMenu account={account} variant="sidebar" />
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
