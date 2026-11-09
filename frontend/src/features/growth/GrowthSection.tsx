import { Link } from 'react-router-dom'
import { SectionTitle } from '../childDetail/ChildDetailParts'
import { GROWTH, countLine, lastLine } from './growthText'
import { useGrowth } from './hooks'

const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'

/** The ruler icon of the section (decorative). */
function RulerIcon() {
  return (
    <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-hint text-action">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 19 19 4M7 16l2 2M10 13l1.5 1.5M13 10l2 2M16 7l1.5 1.5" />
      </svg>
    </span>
  )
}

/**
 * «Crecimiento» in the child's detail (specs/063): the last measurement as it was written («Última: 12.4 kg · 86 cm, 03 nov 2026»,
 * never evaluated) or «Aún no hay medidas», and a link to the record. Both designs.
 */
export function GrowthSection({ childId, variant }: { childId: string; variant: 'phone' | 'desktop' }) {
  const growth = useGrowth(childId)
  const desktop = variant === 'desktop'
  const measurements = growth.data?.measurements ?? []
  const last = measurements[0]
  const summary = !growth.isSuccess ? GROWTH.subtitle : last ? lastLine(last) : GROWTH.emptyTitle
  const link = growth.data?.canEdit && !last ? GROWTH.add : growth.isSuccess ? countLine(measurements.length) : GROWTH.title
  return (
    <section id="crecimiento" aria-label={GROWTH.title} className={`flex scroll-mt-16 flex-col ${desktop ? 'gap-3' : 'gap-2.5'}`}>
      <SectionTitle variant={variant}>{GROWTH.title}</SectionTitle>
      <Link to={`/children/${childId}/crecimiento`} className={`${card} flex items-center ${desktop ? 'gap-3.5 px-5 py-4' : 'gap-3 px-4 py-3.5'}`}>
        <RulerIcon />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-extrabold text-ink">{summary}</span>
          <span className="text-[14px] font-bold text-action">{link}</span>
        </span>
        <span aria-hidden="true" className="text-[22px] font-extrabold text-action">
          ›
        </span>
      </Link>
    </section>
  )
}
