import type { ReactNode } from 'react'
import { UpdateNotice } from '../../shared/appVersion/UpdateNotice'
import { PullIndicator } from '../../shared/pullToRefresh/PullIndicator'
import { usePullToRefresh } from '../../shared/pullToRefresh/usePullToRefresh'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { ChildrenSidebar } from './ChildrenSidebar'
import { useSidebarSession } from './useSidebarSession'

interface AppShellProps {
  activeChildId?: string
  children: ReactNode
}

/**
 * Wraps a signed-in screen: below 900px it's just the screen (mobile
 * column); from 900px up it adds the persistent children sidebar next to
 * it (FR-012). Without a saved account there's no children list to show,
 * so it never renders the sidebar.
 *
 * The screen keeps the same place in the tree whether or not the sidebar is there: the account
 * arrives after the screen has mounted, and if the sidebar's arrival changed the screen's parent,
 * React would remount it and wipe what the tutor had already typed (or the photo already chosen).
 *
 * It also hosts what every signed-in screen shares (specs/017): pull down to refresh the data (phone design only) and
 * the "Hay una versión nueva" bar. Both sit after the screen, so the screen's place in the tree does not change.
 */
export function AppShell({ activeChildId, children }: AppShellProps) {
  const { accountId, hasSidebar } = useSidebarSession()

  const isDesktop = useIsDesktop()
  const pull = usePullToRefresh(!isDesktop)

  const sidebar = hasSidebar && accountId !== null

  return (
    <>
      <div className={sidebar ? 'flex min-h-screen' : undefined}>
        {sidebar && <ChildrenSidebar accountId={accountId} activeChildId={activeChildId} />}
        <div className={sidebar ? 'min-w-0 flex-1' : undefined}>{children}</div>
      </div>
      {!isDesktop && <PullIndicator state={pull} />}
      <UpdateNotice />
    </>
  )
}
