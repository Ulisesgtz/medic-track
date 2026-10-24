import { useMemo } from 'react'
import { groupByVaccine } from './groupByVaccine'
import { VaccineGroup } from './VaccineGroup'
import type { Vaccination } from './types'

interface VaccineListProps {
  doses: Vaccination[]
  canEdit: boolean
  onEdit: (dose: Vaccination, opener: HTMLElement) => void
  onDelete: (dose: Vaccination, opener: HTMLElement) => void
}

/** The recorded doses grouped by vaccine (see `groupByVaccine`): a way of showing what was recorded, nothing more. */
export function VaccineList({ doses, canEdit, onEdit, onDelete }: VaccineListProps) {
  const groups = useMemo(() => groupByVaccine(doses), [doses])
  return (
    <ul aria-label="Vacunas registradas" className="flex flex-col gap-4">
      {groups.map((group) => (
        <VaccineGroup key={group.key} group={group} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </ul>
  )
}
