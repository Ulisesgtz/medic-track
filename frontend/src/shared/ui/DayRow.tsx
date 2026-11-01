import type { ReactNode } from 'react'

// specs/055: the row of a day — an icon, a title and a value — shared by the home's cards and the child's own phone
// (`childDevice/phone`, which may not import from `features/home`). Sizes from the design (`referencia/medidas.md`).

export type DayKind = 'med' | 'sup' | 'act'

const PATHS: Record<DayKind, ReactNode> = {
  med: (
    <>
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="M9.5 9.5l5 5" />
    </>
  ),
  sup: <path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z" />,
  act: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </>
  ),
}

/** The icon tile: a pill (medication), a drop (supplement) or a check in a circle (activity), on `hint`. */
export function DayIcon({ kind, size = 'sm' }: { kind: DayKind; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-hint ${size === 'md' ? 'h-10 w-10 rounded-xl' : 'h-9 w-9 rounded-[10px]'}`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className="stroke-action"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[kind]}
      </svg>
    </span>
  )
}

/** «💊 Medicamentos ……… 3 tomas hoy · 1 por marcar». */
export function DayRow({ kind, title, value, variant = 'phone' }: { kind: DayKind; title: string; value: string; variant?: 'phone' | 'desktop' }) {
  return (
    <span className="flex min-h-11 items-center gap-3">
      <DayIcon kind={kind} />
      <span className={`flex-1 font-bold text-muted ${variant === 'desktop' ? 'text-sm' : 'text-[13px]'}`}>{title}</span>
      <span className="text-right text-[15px] font-bold text-ink">{value}</span>
    </span>
  )
}
