import { formatDateShort } from '../../shared/date'

// Every sentence of editing a consultation (specs/051), so one test can read them all: they describe what happens to what was
// registered, never evaluate the treatment or say what to do about it (Principio I).

export const EDIT_TEXT = {
  open: 'Editar consulta',
  title: 'Editar consulta',
  save: 'Guardar cambios',
  saving: 'Guardando…',
  cancel: '← Cancelar',
  leave: '¿Descartar los cambios? Se perderá lo que cambiaste.',
  photoKept: 'La foto guardada se queda si no eliges otra.',
  changePhoto: 'Cambiar foto',
  recordOnlyFixed: 'Así se guardó esta consulta; no se puede cambiar.',
  scheduleConfirm: {
    title: '¿Guardar el nuevo horario?',
    rows: [
      { k: 'Lo ya marcado', v: 'Las tomas que ya marcaste no cambian.' },
      { k: 'Lo que viene', v: 'Las que aún no llegan se acomodan al nuevo horario.' },
    ],
    confirm: 'Guardar cambios',
    busy: 'Guardando…',
    cancel: 'Volver',
  },
  conflict: 'Alguien guardó cambios en esta consulta mientras la editabas. Te mostramos la versión guardada; vuelve a hacer tus cambios.',
  hasMarks: 'Un medicamento que quitaste tiene tomas marcadas, así que se queda. Te mostramos la versión guardada.',
  cantRemove: 'Tiene tomas marcadas: no se puede quitar.',
  ended: 'El tratamiento terminó: su horario ya no cambia.',
  error: 'No se pudieron guardar los cambios. Intenta de nuevo; la consulta sigue como estaba.',
} as const

/** «Editada el 26 oct 2026 por Ana» — the day in the parent's own time zone. */
export function editedLine(edited: { at: string; by: string }): string {
  const d = new Date(edited.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = Number.isNaN(d.getTime()) ? edited.at : formatDateShort(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  return edited.by ? `Editada el ${day} por ${edited.by}` : `Editada el ${day}`
}
