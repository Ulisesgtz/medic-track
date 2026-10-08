import { ActividadTarjeta } from './ActividadTarjeta'
import { SuplementoTarjeta } from './SuplementoTarjeta'
import type { Routine } from './types'

/** A supplement's or an activity's card in a section: the kind of the routine picks the design (specs/035). */
export function RoutineCard({ routine, today, canManage }: { routine: Routine; today: string; canManage: boolean }) {
  return routine.kind === 'activity' ? (
    <ActividadTarjeta routine={routine} today={today} />
  ) : (
    <SuplementoTarjeta routine={routine} today={today} canManage={canManage} />
  )
}
