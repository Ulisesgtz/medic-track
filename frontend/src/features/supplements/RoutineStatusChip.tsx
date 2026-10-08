import type { RoutineKind, RoutineStatus } from './types'

/**
 * The status chip of a supplement («Activo», «Pausado», «Terminado») or an activity («Activa», «Pausada», «Terminada»): «activo» in
 * the hint colors, the others in slate — never green or amber (those are for the doses).
 */
export function RoutineStatusChip({ kind, status }: { kind: RoutineKind; status: RoutineStatus }) {
  const feminine = kind === 'activity'
  if (status === 'active') {
    return (
      <span className="shrink-0 rounded-full border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-xs font-extrabold tracking-[0.08em] text-action uppercase">
        {feminine ? 'Activa' : 'Activo'}
      </span>
    )
  }
  const label = status === 'paused' ? (feminine ? 'Pausada' : 'Pausado') : feminine ? 'Terminada' : 'Terminado'
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold tracking-[0.08em] text-slate-600 uppercase">{label}</span>
  )
}
