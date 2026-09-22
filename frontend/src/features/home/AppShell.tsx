import type { ReactNode } from 'react'
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
 */
export function AppShell({ activeChildId, children }: AppShellProps) {
  const { accountId, hasSidebar } = useSidebarSession()

  if (!hasSidebar || accountId === null) return <>{children}</>

  return (
    <div className="flex min-h-screen">
        <ChildrenSidebar accountId={accountId} activeChildId={activeChildId} />
        <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
