import { useCallback, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnectivity } from './connectivity'
import { BANNER_LABEL, bannerText } from './offlineText'
import { oldestShownAnswer } from './queryView'

/**
 * «Sin conexión · datos de las 08:15» (specs/067, FR-004, contracts/ui.md §1): while the app can't reach the server and the screen
 * shows data, the hour of the oldest of them — and the day when it isn't today. A neutral strip (no red, no alarm) across the top
 * that pushes the content; announced politely. It goes when the connection is back and the screen has new data.
 */
export function OfflineBanner() {
  const queryClient = useQueryClient()
  const connectivity = useConnectivity()
  const subscribe = useCallback((listener: () => void) => queryClient.getQueryCache().subscribe(listener), [queryClient])
  const oldest = useSyncExternalStore(subscribe, () => oldestShownAnswer(queryClient), () => null)
  const shown = connectivity === 'offline' && oldest !== null

  return (
    // A polite live region (not `role="status"`: the screens have statuses of their own), announced without moving the focus.
    <div aria-live="polite" data-offline-banner={BANNER_LABEL} className={shown ? 'border-b border-hint-border bg-hint' : 'sr-only'}>
      {shown && <p className="mx-auto flex min-h-9 max-w-5xl items-center px-4 py-2 text-[14px] font-bold text-ink">{bannerText(oldest)}</p>}
    </div>
  )
}
