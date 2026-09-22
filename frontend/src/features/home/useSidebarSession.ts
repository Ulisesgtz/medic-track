import { useState } from 'react'
import { useIsDesktop, useIsWide } from '../../shared/ui/useIsDesktop'
import { useAccountSession } from './useAccountSession'

/**
 * Whether the desktop children sidebar is on screen, and for which account.
 * The one place that decides it: `AppShell` renders the sidebar from it. `isDesktop`
 * is the rule that picks the *web* design over the *phone* one on every screen
 * (the delivered mockups are separate designs, never mixed); the sidebar is
 * added on top of the web design only from 1024px (the mockups hide it below
 * `lg`, and stack the page in one column) and when there is an account to list.
 */
export function useSidebarSession(): { accountId: string | null; hasSidebar: boolean; isDesktop: boolean } {
  const isDesktop = useIsDesktop()
  const isWide = useIsWide()
  const { getAccountId } = useAccountSession()
  const [accountId] = useState<string | null>(() => getAccountId())
  return { accountId, hasSidebar: isDesktop && isWide && accountId !== null, isDesktop }
}
