import { useLocalDay } from '../../shared/useLocalDay'
import { useMarkDone } from './hooks'
import type { RoutineDose } from './types'

const outline =
  'border-2 border-action bg-transparent text-action hover:bg-hint focus-visible:ring-action'
const solid = 'bg-confirmed text-white hover:bg-emerald-800 focus-visible:ring-confirmed'

/**
 * «✓ Realizado» (specs/035 B6): the activity's one action — each tap marks the next dose of the person's local day, with no
 * hour to choose. Outline on the lists (a solid one per card would be many) and solid on the activity's own detail, where it is
 * the main action. It never depends on the plan. The accessible name carries the activity's name, so a list of them is told apart.
 */
export function RealizadoButton({
  routineId,
  name,
  doses,
  variant = 'outline',
  className = '',
}: {
  routineId: string
  name: string
  /** The doses the screen has: the next one of today shows marked at once (specs/066). */
  doses?: RoutineDose[]
  variant?: 'outline' | 'solid'
  className?: string
}) {
  const day = useLocalDay()
  const mutation = useMarkDone(routineId, day, { name, doses })
  return (
    <button
      type="button"
      aria-label={`Realizado: ${name}`}
      onClick={() => mutation.mutate()}
      className={`cursor-pointer rounded-2xl px-[18px] text-base font-extrabold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        variant === 'solid' ? `min-h-[52px] px-[22px] text-[17px] ${solid}` : `min-h-12 ${outline}`
      } ${className}`}
    >
      <span aria-hidden="true">✓ </span>Realizado
    </button>
  )
}
