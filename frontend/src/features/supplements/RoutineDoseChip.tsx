import { DoseChipView } from '../consultations/DoseChip'
import { useRoutineDoseToggle } from './hooks'
import type { RoutineDose } from './types'

/**
 * One dose of a supplement routine as the same chip a medication's dose has (mock TomaChip): taken in green with
 * "por Ana, 08:05", amber while it is "por marcar", grey before its time, dashed "sin registrar". It marks through the
 * routine's own endpoint, which never depends on the plan.
 */
export function RoutineDoseChip({
  routineId,
  name,
  dose,
  canManage = true,
  own = false,
}: {
  routineId: string
  /** The routine's name, for the notice of a mark that didn't get saved (specs/066). */
  name?: string
  dose: RoutineDose
  canManage?: boolean
  /** The person's own routine: «a las 07:20», no name. */
  own?: boolean
}) {
  const mutation = useRoutineDoseToggle(routineId, dose.id, { name, scheduledAt: dose.scheduledAt })
  return <DoseChipView dose={dose} canManage={canManage} pending={false} onToggle={() => mutation.mutate(!dose.taken)} own={own} />
}
