import type { RefObject } from 'react'
import { ConfirmDialog } from '../family/ConfirmDialog'

interface FinishRoutineDialogProps {
  name: string
  /** The doses already marked, which stay. */
  taken: number
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  opener: RefObject<HTMLElement | null>
  /** The person's own routine: no family to mention. */
  personal?: boolean
}

/**
 * «Finalizar rutina» (mock D5): the same neutral three-row confirmation as the family's — what stops, what stays, what comes
 * next — with the button in `ink`, not red (finishing is not an error). It cannot be undone: a finished routine is not resumed
 * or edited; the parent creates a new one. Text in the first row follows the real rule: only doses that haven't come yet
 * disappear; today's that already came and weren't marked stay as «sin registrar».
 */
export function FinishRoutineDialog({ name, taken, busy, error, onConfirm, onCancel, opener, personal = false }: FinishRoutineDialogProps) {
  return (
    <ConfirmDialog
      title={`¿Finalizar ${name}?`}
      rows={[
        {
          k: 'Deja de pasar',
          v: personal
            ? 'Desde ahora no se crean más tomas ni avisos. Las de hoy que aún no llegan dejan de aparecer.'
            : 'Desde ahora no se crean más tomas ni avisos para nadie de la familia. Las de hoy que aún no llegan dejan de aparecer.',
        },
        {
          k: 'Se conserva',
          v: `${taken === 1 ? 'La toma marcada' : `Las ${taken} tomas marcadas`}, con quién las marcó y a qué hora, y el calendario hasta hoy.`,
        },
        {
          k: 'Después',
          v: 'Queda en «Pausadas y terminadas». No se puede reanudar; para volver a registrarla, crea una rutina nueva.',
        },
      ]}
      confirmLabel="Finalizar rutina"
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
