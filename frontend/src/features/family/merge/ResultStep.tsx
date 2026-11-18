import type { ReactNode } from 'react'
import { cardClass } from './MergeFrame'
import { DONE } from './mergeText'

function Card({ icon, title, children, busy = false }: { icon: ReactNode; title: string; children: ReactNode; busy?: boolean }) {
  return (
    <section className={`${cardClass} flex max-w-[558px] flex-col items-start gap-3.5 px-[22px] py-6`} aria-busy={busy || undefined}>
      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        {icon}
      </span>
      <h1 tabIndex={-1} className="text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">
        {title}
      </h1>
      {children}
    </section>
  )
}

const svg = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const }

/** E1: «Uniendo a Mateo». The merge is one request, so the bar only says it is working (no percent, no time, no invented steps). */
export function MergingCard({ names }: { names: string }) {
  const title = DONE.merging(names)
  return (
    <Card
      busy
      title={title}
      icon={
        <svg {...svg} className="motion-safe:animate-spin">
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      }
    >
      <p className="text-[15px] leading-[1.55] text-body">{DONE.keepOpen}</p>
      <div role="progressbar" aria-label={title} aria-busy="true" className="h-2.5 w-full overflow-hidden rounded-full border border-hint-border bg-hint">
        <div className="h-full w-1/2 rounded-full bg-action motion-safe:animate-pulse" />
      </div>
    </Card>
  )
}

/** E2: «Se unió Mateo», plain statement. */
export function MergedCard({ names, lines, failedLine }: { names: string[]; lines: string[]; failedLine: string | null }) {
  return (
    <Card
      title={DONE.merged(names)}
      icon={
        <svg {...svg} strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      }
    >
      {lines.map((l) => (
        <p key={l} className="text-[15px] leading-[1.55] text-body">
          {l}
        </p>
      ))}
      {failedLine && <p className="text-[15px] leading-[1.55] font-bold text-ink">{failedLine}</p>}
    </Card>
  )
}

/** E3: the neutral error. A circle with a dash, plain text, «No cambió nada». */
export function FailedCard() {
  return (
    <Card
      title={DONE.failedTitle}
      icon={
        <svg {...svg}>
          <path d="M6 12h12" />
        </svg>
      }
    >
      <p className="text-[15px] leading-[1.55] text-body">{DONE.failedBody}</p>
    </Card>
  )
}
