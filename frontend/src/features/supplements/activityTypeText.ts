// The words of the activity types (specs/075), in one place so a test can check none of them judges (Principio I). The type is only
// a category the parent picks to organize the list: nothing here suggests one, grades an activity or says what is missing.

export const ACTIVITY_TYPE_TEXT = {
  /** The form's group title and the «· Obligatorio» that follows it. */
  legend: 'Tipo de actividad',
  required: 'Obligatorio',
  /** Under the group while nothing is picked and a save was tried (the field can't be empty). */
  missing: 'Elige el tipo de actividad.',
  /** The one line under the group's title that says what it is for. */
  hint: 'Solo sirve para ordenar la lista de actividades.',
  /** The detail's row. */
  rowLabel: 'Tipo',
  change: 'Cambiar',
  /** The detail's «Cambiar» dialog. */
  dialogTitle: 'Tipo de actividad',
  dialogText: 'Solo organiza la lista. No cambia los horarios ni los avisos.',
  save: 'Guardar',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  /** The catalog could not be loaded in the form or in the dialog. */
  catalogFailed: 'No pudimos cargar los tipos de actividad. Inténtalo de nuevo.',
  loading: 'Cargando los tipos…',
  /** A save of the dialog failed. */
  saveFailed: 'No se pudo cambiar el tipo. Inténtalo de nuevo.',
  /** The detail of an activity when the plan lapsed (mock D2): it can be seen, marked and its type changed. */
  planLapsed:
    'Tu plan completo venció. Puedes ver la actividad, marcar «Realizado» y cambiar su tipo. Para editar, pausar o reanudar se necesita el plan completo.',
} as const

/** The empty «Actividades» (mock A3): a dashed box with a title and one sentence; the person's own say «tu registro». */
export const emptyActivities = {
  title: 'Aún no hay actividades',
  text: (childFirstName: string | null) =>
    `Agrega rutinas, deportes, terapias o hábitos ${childFirstName ? `de ${childFirstName}` : ''}${childFirstName ? ' para llevar su registro.' : 'para llevar tu registro.'}`,
}

/** «Cambiar el tipo de actividad, ahora Deportiva»: the name of the detail's button (without the name, while the catalog isn't there, only «Cambiar el tipo de actividad»: never the code). */
export const changeLabel = (typeName: string) => (typeName ? `Cambiar el tipo de actividad, ahora ${typeName}` : 'Cambiar el tipo de actividad')

/** The dialog's legend: «Elige un tipo · Actual: Deportiva». */
export const chooseLegend = (typeName: string) => (typeName ? `Elige un tipo · Actual: ${typeName}` : 'Elige un tipo')

/** The count at the right of a segment's title: «1 actividad» / «2 actividades». */
export const activityCount = (n: number) => `${n} ${n === 1 ? 'actividad' : 'actividades'}`
