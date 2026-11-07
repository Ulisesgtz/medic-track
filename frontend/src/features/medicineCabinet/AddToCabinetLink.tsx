import { Link } from 'react-router-dom'
import { CABINET, shortcutName } from './cabinetText'
import { BoxIcon } from './CabinetParts'
import type { FromConsultation } from './types'

/**
 * specs/062, mock pantalla 5: «Agregar al botiquín» in a medication's card of the consultation detail — a text button with the box
 * icon, 44 px, no border («Marcar» keeps its outline). It opens the form with the prescription's name, carried in the router's
 * state, never in the address (Principio II).
 */
export function AddToCabinetLink({ from }: { from: FromConsultation }) {
  return (
    <Link
      to="/botiquin/nuevo"
      state={{ fromConsultation: from }}
      aria-label={shortcutName(from.name)}
      className="-my-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start text-[14px] font-extrabold text-action hover:underline"
    >
      <BoxIcon size={18} />
      {CABINET.shortcut}
    </Link>
  )
}
