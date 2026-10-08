import type { RefObject } from 'react'
import { ConfirmDialog } from '../family/ConfirmDialog'
import type { RoutineKind } from './types'

interface FinishRoutineDialogProps {
  kind: RoutineKind
  name: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  opener: RefObject<HTMLElement | null>
  /** The person's own: no family to mention. */
  personal?: boolean
}

/**
 * «Finalizar suplemento» / «Finalizar actividad» (mock D5): the same neutral three-row confirmation as the family's — what stops, what
 * stays, what comes next — with the button in `ink`, not red (finishing is not an error). It cannot be undone: a finished one is not
 * resumed or edited; the parent adds a new one. The first row follows the real rule: only what hasn't come yet disappears.
 */
export function FinishRoutineDialog({ kind, name, busy, error, onConfirm, onCancel, opener, personal = false }: FinishRoutineDialogProps) {
  const activity = kind === 'activity'
  const rows = activity
    ? [
        { k: 'Deja de pasar', v: personal ? 'Desde hoy no llegan más avisos de esta actividad.' : 'Desde hoy no llegan más avisos de esta actividad a nadie de la familia.' },
        { k: 'Se conserva', v: personal ? 'Cada «Realizado» y a qué hora.' : 'Cada «Realizado», con quién lo marcó y a qué hora.' },
        { k: 'Después', v: 'Queda en «Pausadas y terminadas». No se puede reanudar; para volver a registrarla, agrega una actividad nueva.' },
      ]
    : [
        {
          k: 'Deja de pasar',
          v: personal
            ? 'Desde hoy no se crean más tomas ni avisos. Las de hoy que no estén marcadas dejan de aparecer.'
            : 'Desde hoy no se crean más tomas ni avisos para nadie de la familia. Las de hoy que no estén marcadas dejan de aparecer.',
        },
        { k: 'Se conserva', v: personal ? 'Cada toma marcada y a qué hora.' : 'Cada toma marcada, con quién la marcó y a qué hora.' },
        { k: 'Después', v: 'Queda en «Pausados y terminados». No se puede reanudar; para volver a registrarlo, agrega un suplemento nuevo.' },
      ]
  return (
    <ConfirmDialog
      title={`¿Finalizar ${name}?`}
      rows={rows}
      confirmLabel={activity ? 'Finalizar actividad' : 'Finalizar suplemento'}
      busyLabel="Finalizando…"
      tone="ink"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      opener={opener}
    />
  )
}
