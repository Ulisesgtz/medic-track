type Tone = 'plain' | 'pending' | 'confirmed' | 'ink'

interface SummaryCardProps {
  label: string
  value: string
  /** Small line under the figure (e.g. "sin marcar", "desde 2024"). */
  sub?: string
  tone?: Tone
  /** 'lg' = 34px figure; 'md' = 22px, for a name instead of a number. */
  size?: 'lg' | 'md'
}

// Text ink per surface, as fixed by design-tokens.md: on-pending on amber,
// confirmed-strong on confirmed-soft, white/bright on ink.
const TONES: Record<Tone, { card: string; label: string; value: string; sub: string }> = {
  plain: { card: 'bg-surface', label: 'text-action', value: 'text-ink', sub: 'text-slate-600' },
  pending: { card: 'bg-pending', label: 'text-on-pending', value: 'text-on-pending', sub: 'text-on-pending' },
  confirmed: {
    card: 'bg-confirmed-soft',
    label: 'text-confirmed-strong',
    value: 'text-confirmed-strong',
    sub: 'text-confirmed-strong',
  },
  ink: { card: 'bg-ink', label: 'text-bright', value: 'text-white', sub: 'text-bright' },
}

/** One figure of the child-detail summary row: overline label, big figure, small note. */
export function SummaryCard({ label, value, sub, tone = 'plain', size = 'lg' }: SummaryCardProps) {
  const t = TONES[tone]
  return (
    <div className={`min-w-0 rounded-3xl p-[22px] shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${t.card}`}>
      <p className={`text-xs font-extrabold tracking-[0.1em] uppercase ${t.label}`}>{label}</p>
      <p
        className={`mt-3 truncate leading-none font-black tracking-tight ${t.value} ${
          size === 'lg' ? 'text-[34px]' : 'text-[22px]'
        }`}
      >
        {value}
      </p>
      {sub ? <p className={`mt-3 truncate text-[13px] font-semibold ${t.sub}`}>{sub}</p> : null}
    </div>
  )
}
