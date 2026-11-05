import type { RoutineKind } from './types'

// specs/060: every sentence of deleting a supplement or an activity captured by mistake. They say what goes and that it can't be
// undone; none of them judges the person or the routine (Principio I). deleteCopy.test.ts reads them all.

export interface DeleteCopy {
  /** The button of the detail: «Eliminar suplemento». */
  button: string
  title: (name: string) => string
  rows: { k: string; v: string }[]
  confirm: string
  busy: string
  /** The server refused: a dose was marked meanwhile (409 routine_has_marks). */
  hasMarks: string
  failed: string
}

export function deleteCopy(kind: RoutineKind, personal: boolean): DeleteCopy {
  const activity = kind === 'activity'
  const what = activity ? 'La actividad, todos sus horarios' : 'El suplemento, todas sus tomas'
  return {
    button: activity ? 'Eliminar actividad' : 'Eliminar suplemento',
    title: (name) => `¿Eliminar ${name}?`,
    rows: [
      { k: 'Se borra', v: personal ? `${what} y sus avisos.` : `${what} y sus avisos, para todas las personas de la familia.` },
      { k: 'Después', v: 'Deja de aparecer en todas las pantallas. No se puede deshacer.' },
      {
        k: 'Para conservarlo',
        v: activity ? 'Si prefieres guardar su registro, usa «Finalizar actividad».' : 'Si prefieres guardar su registro, usa «Finalizar suplemento».',
      },
    ],
    confirm: 'Eliminar',
    busy: 'Eliminando…',
    hasMarks: activity
      ? 'Esta actividad ya tiene marcas de «Realizado», así que no se puede eliminar. Puedes finalizarla.'
      : 'Este suplemento ya tiene tomas marcadas, así que no se puede eliminar. Puedes finalizarlo.',
    failed: 'No se pudo eliminar. Inténtalo de nuevo.',
  }
}
