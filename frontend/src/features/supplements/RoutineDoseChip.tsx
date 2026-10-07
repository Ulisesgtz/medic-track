import { DoseChipView } from '../consultations/DoseChip'
import { useRoutineDoseToggle } from './hooks'
import type { RoutineDose } from './types'

/**
 * One dose of a supplement routine as the same chip a medication's dose has (mock TomaChip): taken in green with
 * "por Ana, 08:05", amber while it is "por marcar", grey before its time, dashed "sin registrar". It marks through the
 * routine's own endpoint, which never depends on the plan.
 */
export function RoutineDoseChip({ routineId, dose, canManage = true }: { routineId: string; dose: RoutineDose; canManage?: boolean }) {
  const mutation = useRoutineDoseToggle(routineId, dose.id)
  return <DoseChipView dose={dose} canManage={canManage} pending={mutation.isPending} onToggle={() => mutation.mutate(!dose.taken)} />
}
