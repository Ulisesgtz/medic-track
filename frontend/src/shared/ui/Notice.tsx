import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type NoticeTone = 'error' | 'info' | 'success'

const TONES: Record<NoticeTone, { box: string; icon: string; link: string }> = {
  error: { box: 'border-rose-200 bg-rose-50', icon: 'bg-rose-100 text-rose-700', link: 'text-rose-800' },
  info: { box: 'border-hint-border bg-hint', icon: 'bg-hint-border text-action', link: 'text-action' },
  success: { box: 'border-[#a7f3d0] bg-confirmed-soft', icon: 'bg-[#a7f3d0] text-confirmed-strong', link: 'text-confirmed-strong' },
}

const ICONS: Record<NoticeTone, ReactNode> = {
  error: (
    <path d="M12 8v5m0 3.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  ),
  info: <path d="M12 11v5m0-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  success: <path d="m8 12.5 2.8 2.8L16.5 9.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
}

/**
 * A message block for feedback that isn't tied to one field (a rejection from
 * Clerk or the server, "you're already signed in", a confirmation). Soft
 * surface, an icon and dark ink text instead of a wall of red; errors are
 * announced (`role="alert"`), the rest are polite status updates.
 */
export function Notice({
  tone = 'error',
  children,
  action,
}: {
  tone?: NoticeTone
  children: ReactNode
  action?: { label: string; to: string }
}) {
  const styles = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-2xl border p-4 ${styles.box}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${styles.icon}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[tone]}
        </svg>
      </span>
      <div className="min-w-0 text-sm leading-relaxed font-semibold text-ink">
        <p>{children}</p>
        {action && (
          <Link to={action.to} className={`mt-1.5 inline-block font-extrabold underline underline-offset-2 ${styles.link}`}>
            {action.label}
          </Link>
        )}
      </div>
    </div>
  )
}
