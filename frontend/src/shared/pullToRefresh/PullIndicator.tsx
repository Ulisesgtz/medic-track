import { Notice } from '../ui/Notice'
import type { PullState } from './usePullToRefresh'

/**
 * What the pull-to-refresh gesture shows (specs/017): a small pill that follows the finger, the same pill while the
 * data is fetched again, and a notice when it could not be. No transition or spin under "reduce motion".
 */
export function PullIndicator({ state }: { state: PullState }) {
  if (state.phase === 'idle') return null

  if (state.phase === 'failed') {
    return (
      <div className="fixed inset-x-4 top-3 z-40 mx-auto max-w-[398px]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Notice tone="error">No pudimos actualizar. Revisa tu conexión.</Notice>
      </div>
    )
  }

  const refreshing = state.phase === 'refreshing'
  return (
    <div
      role="status"
      className="pointer-events-none fixed top-2 left-1/2 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white shadow-lg"
      style={{ transform: `translate(-50%, ${state.distance}px)`, marginTop: 'env(safe-area-inset-top)' }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={refreshing ? 'motion-safe:animate-spin' : state.ready ? 'rotate-180 motion-safe:transition-transform' : 'motion-safe:transition-transform'}
      >
        {refreshing ? <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /> : <path d="M12 5v14m0 0-5-5m5 5 5-5" />}
      </svg>
      {refreshing ? 'Actualizando…' : state.ready ? 'Suelta para actualizar' : 'Jala para actualizar'}
    </div>
  )
}
