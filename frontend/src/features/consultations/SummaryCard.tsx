type Tone = 'plain' | 'pending' | 'confirmed' | 'ink'

interface SummaryCardProps {
  label: string
  value: string
  /** Small line under the figure (e.g. "sin marcar", "desde 2024"). */
  sub?: string
  tone?: Tone
  /** 'lg' = 34px figure; 'md' = 20px, for a name instead of a number. */
  size?: 'lg' | 'md'
}

// Board screen 6: text ink per surface — #451a03 on amber, #065f46 on the soft
// green (the "all marked" state), #0b3b44 on white, white/cyan on ink.
const TONES: Record<Tone, { card: string; label: string; value: string; sub: string }> = {
  plain: {
    card: 'bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]',
    label: 'text-ink-soft',
    value: 'text-ink',
    sub: 'text-slate-500',
  },
  pending: { card: 'bg-pending', label: 'text-[#451a03]', value: 'text-[#451a03]', sub: 'text-[#613102]' },
  confirmed: {
    card: 'bg-confirmed-soft',
    label: 'text-[#065f46]',
    value: 'text-[#065f46]',
    sub: 'text-[#065f46]',
  },
  ink: { card: 'bg-ink', label: 'text-[#67e8f9]', value: 'text-white', sub: 'text-[#a5f3fc]' },
}

/** One figure of the child-detail summary row: overline label, big figure, small note. */
export function SummaryCard({ label, value, sub, tone = 'plain', size = 'lg' }: SummaryCardProps) {
  const t = TONES[tone]
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-[20px] p-[22px] ${t.card}`}>
      <p className={`text-xs font-extrabold tracking-[0.1em] uppercase ${t.label}`}>{label}</p>
      <p
        className={`truncate leading-tight font-black ${t.value} ${
          size === 'lg' ? 'text-[34px] tracking-[-0.03em]' : 'text-xl tracking-[-0.02em]'
        }`}
      >
        {value}
      </p>
      {sub ? <p className={`truncate text-sm font-semibold ${t.sub}`}>{sub}</p> : null}
    </div>
  )
}
