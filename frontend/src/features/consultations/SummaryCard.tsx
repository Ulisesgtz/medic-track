interface SummaryCardProps {
  label: string
  value: string
}

/**
 * One figure of the child-detail summary grid: big number, small overline
 * label. The figure steps down from 34px to 26px when the card is narrow
 * (three across on a small screen or beside the sidebar) so a date like
 * "15 sep 2026" isn't cut off.
 */
export function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="@container rounded-[22px] bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">{label}</p>
      <p className="mt-2 truncate text-[34px] leading-none @max-[200px]:text-[26px] font-black tracking-tight text-ink">{value}</p>
    </div>
  )
}
