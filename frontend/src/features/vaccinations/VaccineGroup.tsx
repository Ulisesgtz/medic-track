import type { MouseEvent } from 'react'
import { TEXT, correctedLine, doseLine, groupLabel } from './vaccineText'
import type { Vaccination, VaccineGroup as Group } from './types'

const actionButton =
  'min-h-11 cursor-pointer rounded-xl px-3 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action'

interface VaccineGroupProps {
  group: Group
  /** Who may correct and delete: decided by `useChildAccess(...).canAdd`, enforced by the server. */
  canEdit: boolean
  onEdit: (dose: Vaccination, opener: HTMLElement) => void
  onDelete: (dose: Vaccination, opener: HTMLElement) => void
}

/**
 * One vaccine with the doses recorded for it, oldest first. It only shows what was recorded — no count of doses «missing», no
 * schedule, no status — and, for a dose someone corrected, «Corregida el … por Ana» (the first name, never the e-mail).
 */
export function VaccineGroup({ group, canEdit, onEdit, onDelete }: VaccineGroupProps) {
  return (
    <li className="flex flex-col gap-1 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <h3 className="text-lg font-black tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">{group.name}</h3>
      <ul className="flex flex-col">
        {group.doses.map((dose) => {
          const corrected = correctedLine(dose)
          return (
            <li key={dose.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-hint-edge py-3 first:border-t-0">
              <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                <span className="text-base font-extrabold text-ink [overflow-wrap:anywhere]">{doseLine(dose)}</span>
                {dose.lot && <span className="text-[13px] text-body [overflow-wrap:anywhere]">Lote {dose.lot}</span>}
                {dose.notes && <span className="text-[13px] text-body [overflow-wrap:anywhere]">{dose.notes}</span>}
                {corrected && <span className="text-[13px] font-semibold text-slate-600">{corrected}</span>}
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className={actionButton} aria-label={`${TEXT.edit} ${groupLabel(dose)}`} onClick={(e: MouseEvent<HTMLButtonElement>) => onEdit(dose, e.currentTarget)}>
                    {TEXT.edit}
                  </button>
                  <button type="button" className={actionButton} aria-label={`${TEXT.remove} ${groupLabel(dose)}`} onClick={(e: MouseEvent<HTMLButtonElement>) => onDelete(dose, e.currentTarget)}>
                    {TEXT.remove}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </li>
  )
}
