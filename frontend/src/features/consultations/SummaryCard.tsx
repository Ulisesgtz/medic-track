interface SummaryCardProps {
  label: string
  value: string
}

/** One figure of the child-detail summary grid: big number, small overline label. */
export function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="rounded-[22px] bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">{label}</p>
      <p className="mt-2 truncate text-[34px] leading-none font-black tracking-tight text-ink">{value}</p>
    </div>
  )
}
