import { useState } from 'react'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { useAccountSession } from './useAccountSession'

/**
 * Whether the desktop children sidebar is on screen, and for which account.
 * The one place that decides it: `AppShell` renders the sidebar from it and
 * screens (e.g. the child detail) adapt their header to it, so the two can
 * never disagree. No saved account means no children list to show.
 */
export function useSidebarSession(): { accountId: string | null; hasSidebar: boolean } {
  const isDesktop = useIsDesktop()
  const { getAccountId } = useAccountSession()
  const [accountId] = useState<string | null>(() => getAccountId())
  return { accountId, hasSidebar: isDesktop && accountId !== null }
}
