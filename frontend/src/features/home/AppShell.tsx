import { useState, type ReactNode } from 'react'
import { SidebarContext } from '../../shared/ui/SidebarContext'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { ChildrenSidebar } from './ChildrenSidebar'
import { useAccountSession } from './useAccountSession'

interface AppShellProps {
  activeChildId?: string
  children: ReactNode
}

/**
 * Wraps a signed-in screen: below 1024px it's just the screen (mobile
 * column); from 1024px up it adds the persistent children sidebar next to
 * it (FR-012). Without a saved account there's no children list to show,
 * so it never renders the sidebar.
 */
export function AppShell({ activeChildId, children }: AppShellProps) {
  const isDesktop = useIsDesktop()
  const { getAccountId } = useAccountSession()
  const [accountId] = useState<string | null>(() => getAccountId())

  if (!isDesktop || !accountId) return <>{children}</>

  return (
    <SidebarContext.Provider value={true}>
      <div className="grid min-h-screen grid-cols-[288px_minmax(0,1fr)]">
        <ChildrenSidebar accountId={accountId} activeChildId={activeChildId} />
        <div className="min-w-0">{children}</div>
      </div>
    </SidebarContext.Provider>
  )
}
