import type { RefObject } from 'react'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { deleteCopy } from './deleteCopy'
import type { RoutineKind } from './types'

interface DeleteRoutineDialogProps {
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
 * specs/060: deleting a supplement or an activity captured by mistake (only offered while none of its doses is marked). The same
 * neutral three-row confirmation as «Finalizar», in `ink`, not red: correcting a record is not an error. It says what goes, that it
 * can't be undone and that finishing keeps the record instead.
 */
export function DeleteRoutineDialog({ kind, name, busy, error, onConfirm, onCancel, opener, personal = false }: DeleteRoutineDialogProps) {
  const copy = deleteCopy(kind, personal)
  return (
    <ConfirmDialog
      title={copy.title(name)}
      rows={copy.rows}
      confirmLabel={copy.confirm}
      busyLabel={copy.busy}
      tone="ink"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      opener={opener}
    />
  )
}
