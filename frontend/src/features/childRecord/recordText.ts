// specs/073 (mock «Ficha del hijo PediTrack»): every sentence of the record lives here, so one test (recordText.test.ts) can read
// them all. The app shows what the family wrote and never compares it, warns, grades or colors it (Principio I): no «riesgo»,
// «peligro», «grave», «urgente», and never «Sin alergias» / «Sin padecimientos» (that would be claiming something).

import { formatDateShort, formatTime } from '../../shared/date'
import type { AllergyKind, BloodType } from './types'

export const RECORD = {
  title: 'Ficha',
  edit: 'Editar ficha',
  start: 'Empezar la ficha',
  emptyTitle: 'Aún no hay ficha',
  emptyBody: 'Anota alergias, tipo de sangre, padecimientos y su pediatra. Todo es opcional y lo escribes tú.',
  /** The one fixed sentence of the card and of the PDF (FR-010). */
  phrase: 'Lo anotado es lo que la familia escribió y no sustituye la opinión de su médico.',
  viewOnly: 'Puedes ver la ficha y llamar al pediatra. Solo la familia puede editarla.',
  loadFailed: 'No pudimos cargar la ficha.',
  retry: 'Reintentar',
  loading: 'Cargando la ficha…',
  allergies: 'Alergias',
  bloodType: 'Tipo de sangre',
  conditions: 'Padecimientos o condiciones permanentes',
  pediatrician: 'Pediatra de cabecera',
  generalNote: 'Nota general',
  call: 'Llamar',
  callTo: (name: string | null) => (name ? `Llamar a ${name}` : 'Llamar al pediatra'),
  unknownBlood: 'No lo sé',
  kinds: { medication: 'Medicamento', food: 'Alimento', other: 'Otra' } satisfies Record<AllergyKind, string>,
} as const

export const FORM = {
  subtitle: 'Todo es opcional. Escribe lo que quieras guardar.',
  allergy: 'Alergia',
  condition: 'Padecimiento o condición',
  kind: 'Tipo (opcional)',
  note: 'Nota (opcional)',
  name: 'Nombre',
  phone: 'Teléfono',
  office: 'Consultorio o dirección (opcional)',
  bloodHelp: 'Elige una opción (opcional)',
  bloodHint: 'Toca de nuevo la opción elegida para dejarlo sin anotar.',
  addAllergy: '+ Agregar alergia',
  addCondition: '+ Agregar padecimiento',
  remove: 'Quitar',
  cancel: 'Cancelar',
  save: 'Guardar',
  saving: 'Guardando…',
  edit: 'Editar',
  seeAll: (n: number) => `Ver las ${n}`,
  leaveTitle: '¿Salir sin guardarlos?',
  leaveBody: 'Tienes cambios sin guardar.',
  readOnly: 'Solo la familia puede editar la ficha.',
  notFound: 'No encontramos a este hijo.',
  loadFailed: 'la ficha',
  loadError: 'No pudimos cargar la ficha.',
  loading: 'Cargando…',
  saveFailed: 'No se pudo guardar la ficha. Inténtalo de nuevo.',
  seeNewVersion: 'Ver la versión nueva',
  keepEditing: 'Seguir editando',
  close: 'Cerrar',
  nameRequired: 'Escribe el nombre o quita esta entrada. Revisa este campo.',
  phoneInvalid: 'Usa solo números, espacios y + - ( ) . Revisa este campo.',
  serverField: 'Revisa este campo.',
} as const

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** «Actualizada el 17 nov 2026 por Ana» (the date in the parent's local day; only the first name). */
export function updatedLine(at: string, by: string | null): string {
  const d = new Date(at)
  const pad = (x: number) => String(x).padStart(2, '0')
  const day = formatDateShort(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  return by ? `Actualizada el ${day} por ${by}` : `Actualizada el ${day}`
}

/** «O+», «AB−» (a real minus sign, as the mock draws it) or «No lo sé». */
export function bloodLabel(type: BloodType): string {
  return type === 'unknown' ? RECORD.unknownBlood : type.replace('-', '−')
}

/** «2 de 30» next to a list's title. */
export const countOf = (count: number, max: number) => `${count} de ${max}`

/** Under the title when a list reaches its limit (D2). */
export const limitNote = (kind: 'allergy' | 'condition', max: number) =>
  kind === 'allergy'
    ? `Llegaste a ${max} alergias, el máximo que guarda la ficha. Para agregar otra, quita una de la lista.`
    : `Llegaste a ${max} padecimientos, el máximo que guarda la ficha. Para agregar otro, quita uno de la lista.`

/** «y 28 alergias más» (D2). */
export const moreLine = (kind: 'allergy' | 'condition', count: number) =>
  kind === 'allergy' ? `y ${n(count, 'alergia', 'alergias')} más` : `y ${n(count, 'padecimiento', 'padecimientos')} más`

/** The legend, the name of the move buttons… of the item number `i` (1-based): «Alergia 1», «Subir alergia 1». */
export const itemWord = (kind: 'allergy' | 'condition') => (kind === 'allergy' ? 'alergia' : 'padecimiento')
export const itemLegend = (kind: 'allergy' | 'condition', i: number) => `${kind === 'allergy' ? 'Alergia' : 'Padecimiento'} ${i}`

/** The error of a field that is too long: «Máximo 120 caracteres. Revisa este campo.» */
export const tooLong = (max: number) => `Máximo ${max} caracteres. Revisa este campo.`

/** The notice of a conflict (E): who saved and when; what is written stays; saving replaces theirs. */
export const conflictTitle = (by: string | null) => `${by ?? 'Otra persona'} guardó cambios en la ficha`
export const conflictBody = (by: string | null, at: string | null) =>
  `Lo que escribiste sigue aquí. Si guardas ahora, tus cambios reemplazan los de ${by ?? 'esa persona'}${at ? ` de las ${formatTime(at)}` : ''}.`
