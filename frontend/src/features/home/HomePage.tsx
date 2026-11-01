import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useLogout } from '../auth/useLogout'
import { MeApiError } from '../auth/api'
import { ChildrenSection, ReadOnlyNote } from './ChildrenSection'
import { AddChildDialogs } from './AddChildDialogs'
import { addChildTarget, atFreePlanLimit } from './plan'
import { AppShell } from './AppShell'
import { useSidebarSession } from './useSidebarSession'
import { Logo } from '../../shared/ui/Logo'
import { WelcomeDisclaimer } from './WelcomeDisclaimer'
import { readPendingInvitation } from '../family/pendingInvitation'
import { Greeting } from './Greeting'
import { TuDia } from './TuDia'
import { HomeSkeleton } from './HomeSkeleton'
import { AccountMenu } from './AccountMenu'
import { MoreLinks } from './MoreLinks'

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
  const navigate = useNavigate()

  // Specs/032: someone who opened an invitation before logging in or signing up is taken back to it, once.
  const signedInWithAccount = query.isSuccess
  useEffect(() => {
    if (signedInWithAccount && readPendingInvitation()) navigate('/familia/invitacion', { replace: true })
  }, [signedInWithAccount, navigate])

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

  if (query.isPending) {
    // Specs/055 (estado 6): skeletons of the final height, in the same frame as the loaded page.
    return isDesktop ? (
      <AppShell>
        <main className="min-h-screen min-w-0 bg-canvas px-6 py-8 leading-[normal] lg:px-12 lg:pt-11 lg:pb-14">
          <div className="mx-auto max-w-[904px]">
            <HomeSkeleton variant="desktop" />
          </div>
        </main>
      </AppShell>
    ) : (
      <AppShell>
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas px-5 pb-8" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}>
          <HomeSkeleton variant="phone" />
        </main>
      </AppShell>
    )
  }

  const account = query.data
  const children = account?.children ?? []
  const atLimit = account ? atFreePlanLimit(account) : false
  // Specs/032: a Caregiver, a child-role member and a Tutor of a lapsed family can't add children.
  const target = account ? addChildTarget(account) : undefined
  const canAddChild = target?.allowed ?? true

  const dialogs = (
    <AddChildDialogs
      account={account}
      open={showAddChild}
      onClose={() => setShowAddChild(false)}
      opener={addChildButton}
    />
  )

  // Specs/055: a Tutor of a family that stopped paying sees the note; marking keeps working.
  const readOnly = children.some((c) => c.readOnly)
  const childrenSection = (variant: 'phone' | 'desktop') =>
    account && (
      <ChildrenSection
        account={account}
        variant={variant}
        canAddChild={canAddChild}
        planNote={atLimit}
        onAddChild={() => setShowAddChild(true)}
        addChildButton={addChildButton}
      />
    )

  if (isDesktop) {
    return (
      <AppShell>
        <main className="min-h-screen min-w-0 bg-canvas px-6 py-8 leading-[normal] lg:px-12 lg:pt-11 lg:pb-14">
          <div className="mx-auto flex max-w-[904px] flex-col gap-7">
            <WelcomeDisclaimer account={account} />
            {readOnly && <ReadOnlyNote variant="desktop" />}
            {account && <Greeting account={account} variant="desktop" />}
            {account && <TuDia account={account} variant="desktop" />}
            {childrenSection('desktop')}
            {account && <MoreLinks account={account} variant="desktop" />}
          </div>
          {dialogs}
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <main
        className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col gap-5 bg-canvas px-5 pb-8 leading-[normal]"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <div className="empty:hidden">
          <WelcomeDisclaimer account={account} />
        </div>
        {readOnly && <ReadOnlyNote variant="phone" />}
        {account && (
          <Greeting
            account={account}
            variant="phone"
            accountSlot={<AccountMenu account={account} variant="phone" />}
          />
        )}
        {account && <TuDia account={account} variant="phone" />}
        {childrenSection('phone')}
        {account && <MoreLinks account={account} variant="phone" />}
        {dialogs}
      </main>
    </AppShell>
  )
}
