import { formatDateShort } from '../../shared/date'
import type { BirthDateConflict } from './api'

// specs/064: every sentence of «Editar datos» in one place, so childProfileText.test.ts can read them all. The form corrects what
// was captured; nothing here judges a height or a weight (Principio I).

export const CHILD_PROFILE = {
  rowLabel: 'Editar datos',
  title: 'Editar datos',
  back: 'Volver',
  firstName: 'Nombre',
  lastName: 'Apellido',
  birthDate: 'Fecha de nacimiento',
  height: 'Talla (cm)',
  weight: 'Peso (kg)',
  optional: '(opcional)',
  measuresIntro: 'La talla y el peso del registro no tienen fecha. Para la gráfica de crecimiento, anótalos como una medida.',
  alsoMeasurement: 'Anotarlo también como medida de hoy',
  alsoMeasurementHint: 'Queda en Crecimiento con la fecha de hoy.',
  save: 'Guardar cambios',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  leaveTitle: '¿Salir sin guardarlos?',
  leaveBody: 'Tienes cambios sin guardar.',
  planBadge: 'Plan completo',
  identityPlan: 'Corregir el nombre y la fecha de nacimiento es del plan completo. La talla y el peso se corrigen en cualquier plan.',
  readOnly: 'Puedes ver los datos de este hijo. Los corrigen la dueña de la familia y los Tutores.',
  notFound: 'No encontramos a este hijo.',
  loadFailed: 'los datos del hijo',
  saveFailed: 'No se pudieron guardar los cambios. Inténtalo de nuevo.',
  limitReached: 'Este hijo ya tiene 500 medidas anotadas en Crecimiento: guarda sin la casilla o quita alguna medida.',
  errors: {
    firstName: 'Escribe el nombre con letras, espacios, guiones o apóstrofes (hasta 100).',
    lastName: 'Escribe el apellido con letras, espacios, guiones o apóstrofes (hasta 100).',
    birthDate: 'Elige la fecha de nacimiento.',
    birthFuture: 'La fecha de nacimiento no puede ser futura.',
    height: 'Escribe la talla en centímetros.',
    weight: 'Escribe el peso en kilogramos.',
    measurementNone: 'Escribe la talla, el peso o los dos para anotarlos como medida.',
    measurementWeight: 'Para anotarlo como medida, el peso va entre 0.3 y 200 kg, con hasta 2 decimales.',
    measurementHeight: 'Para anotarlo como medida, la talla va entre 30 y 220 cm, con hasta 1 decimal.',
  },
}

/** «Corregido el 9 nov 2026 por Ana» (only the first name). */
export function correctedLine(at: string, by: string): string {
  return `Corregido el ${formatDateShort(at.slice(0, 10))} por ${by}`
}

function list(dates: string[], total: number): string {
  const shown = dates.map(formatDateShort).join(', ')
  return total > dates.length ? `${shown} y ${total - dates.length} más` : shown
}

/** The birth_date_conflict, neutral: how many records and on which dates, and what to do. */
export function conflictLine(c: BirthDateConflict): string {
  const parts: string[] = []
  if (c.measurementCount > 0) parts.push(`${c.measurementCount} ${c.measurementCount === 1 ? 'medida' : 'medidas'} (${list(c.measurements, c.measurementCount)})`)
  if (c.vaccinationCount > 0) parts.push(`${c.vaccinationCount} ${c.vaccinationCount === 1 ? 'vacuna' : 'vacunas'} (${list(c.vaccinations, c.vaccinationCount)})`)
  const total = c.measurementCount + c.vaccinationCount
  return `Hay ${parts.join(' y ')} ${total === 1 ? 'anotada' : 'anotadas'} antes de esa fecha. Corrígelas primero o elige otra fecha.`
}
