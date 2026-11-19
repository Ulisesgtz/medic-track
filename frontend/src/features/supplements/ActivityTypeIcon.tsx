import type { ReactNode } from 'react'

/**
 * The line icon of an activity type (specs/075, mock state E): decorative — `aria-hidden`, the name is always written next to it — and
 * always the same action color: no type has a color of its own, so nothing suggests priority, risk or achievement (Principio I).
 * Drawn inside a 34 px light-cyan box as the mock does. A code the catalog added later has no icon of its own and gets the dots of «Otra».
 */
const ICONS: Record<string, ReactNode> = {
  school: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H20v14H5.5A1.5 1.5 0 0 0 4 19.5z" />
      <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20" />
    </>
  ),
  sports: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6c3.5 3 3.5 9.8 0 12.8M18.4 5.6c-3.5 3-3.5 9.8 0 12.8" />
    </>
  ),
  arts: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  therapy: <path d="M4 5h16v11H9l-5 4z" />,
  habits: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
}

const OTHER = (
  <>
    <circle cx="6" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="18" cy="12" r="1.4" />
  </>
)

export function ActivityTypeIcon({ code }: { code: string }) {
  return (
    <span aria-hidden="true" className="flex size-[34px] flex-none items-center justify-center rounded-[10px] bg-hint text-action">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className="flex-none"
      >
        {ICONS[code] ?? OTHER}
      </svg>
    </span>
  )
}
