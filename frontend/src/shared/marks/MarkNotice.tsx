import { useEffect, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { useIsDesktop } from '../ui/useIsDesktop'
import { dismissAllMarkNotices, markNoticesSnapshot, subscribeMarkNotices } from './markNotices'
import { andMore, CLOSE, NOTICE_LABEL, noticeText, SAVING } from './markText'
import { usePendingMark } from './usePendingMarks'

const MAX_LINES = 3

/**
 * The one notice of the marks that didn't get saved (specs/066, contracts/ui.md §2): the dose went back to what the server has
 * and this says so, in neutral words (Principio I: what happened to the mark, nothing about the medication; no red, no alarm).
 * A polite live region (`aria-live`, not `role="status"`: a screen has other statuses of its own) — announced without moving the focus — fixed above the «Hay una versión nueva» bar: a bar across
 * the phone, a card in the web's corner (separate designs). It leaves when the dose is saved, with «Cerrar» or on another screen.
 */
export function MarkNotice() {
  const notices = useSyncExternalStore(subscribeMarkNotices, markNoticesSnapshot, markNoticesSnapshot)
  const isDesktop = useIsDesktop()
  const { pathname } = useLocation()

  useEffect(() => dismissAllMarkNotices, [pathname])

  const shown = notices.slice(-MAX_LINES)
  const rest = notices.length - shown.length
  const box = isDesktop
    ? 'fixed right-6 bottom-24 z-40 w-full max-w-sm'
    : 'fixed inset-x-3 z-40 mx-auto max-w-[406px]'

  return (
    // The region is always in the page, so a screen reader announces what appears in it.
    <div aria-live="polite" data-mark-notice={NOTICE_LABEL} className={notices.length > 0 ? box : 'sr-only'} style={!isDesktop && notices.length > 0 ? { bottom: 'calc(5rem + env(safe-area-inset-bottom))' } : undefined}>
      {notices.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-hint-border bg-surface py-3 pr-2 pl-4 shadow-xl">
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5 py-1">
            {shown.map((notice) => (
              <li key={notice.doseId} className="text-[14px] leading-snug font-bold text-ink">
                {noticeText(notice)}
              </li>
            ))}
            {rest > 0 && <li className="text-[13px] font-bold text-muted">{andMore(rest)}</li>}
          </ul>
          <button
            type="button"
            onClick={dismissAllMarkNotices}
            className="min-h-11 shrink-0 cursor-pointer rounded-xl px-3 text-[14px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            {CLOSE}
          </button>
        </div>
      )}
    </div>
  )
}

/** «guardando…» next to a dose whose mark has been travelling for 2 seconds (FR-007); nothing before that. */
export function SavingHint({ doseId, className = '' }: { doseId: string | undefined; className?: string }) {
  const { slow } = usePendingMark(doseId)
  if (!slow) return null
  return <span className={`text-[12px] font-bold text-muted ${className}`}>{SAVING}</span>
}
