import { formatDateShort } from '../../shared/date'
import type { CabinetUnit, Expires } from './types'

// specs/062: every sentence of the family's medicine cabinet, from the delivered design. The expiry date is only a datum: no
// sentence here says a medicine expired, can or can't be used, or what to do with it (Principio I). cabinetText.test.ts reads
// them all.

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const CABINET = {
  entryTitle: 'Checa tus medicamentos',
  entryFree: 'Las medicinas que tienen en casa',
  planMark: 'Plan completo',
  sidebar: 'Botiquín',
  backHome: '← Inicio',
  backCabinet: '← Botiquín',
  backConsultation: '← Consulta',
  title: 'Botiquín',
  subtitle: 'De toda la familia',
  add: '+ Agregar al botiquín',
  searchLabel: 'Buscar en el botiquín',
  searchPlaceholder: 'Buscar por nombre',
  emptyTitle: 'Aún no hay medicamentos en el botiquín',
  loading: 'Cargando el botiquín',
  loadFailed: 'el botiquín',
  caregiverLead: 'Vista de Cuidadora.',
  caregiverRest: 'Puedes ver el botiquín. Agregar y editar lo hace la familia.',
  photoAlt: 'foto',
  formTitle: 'Agregar al botiquín',
  editTitle: 'Editar medicamento',
  photoLabel: 'Foto de la caja',
  optional: '(opcional)',
  photoHelpPhone: 'Con foto, la app lee el texto de la caja en tu teléfono y te propone los datos.',
  photoHelpWeb: 'Con foto, la app lee el texto de la caja en tu equipo y te propone los datos.',
  takePhoto: 'Tomar foto',
  galleryPhoto: 'Elegir de la galería',
  choosePhoto: 'Elegir foto',
  changePhoto: 'Cambiar foto',
  removePhoto: 'Quitar foto',
  readingTitle: 'Leyendo la foto…',
  readingPhone: 'El texto se lee en tu teléfono. Mientras, puedes capturar a mano.',
  readingWeb: 'El texto se lee en tu equipo. Mientras, puedes capturar a mano.',
  readTitle: 'Leído de tu foto · revísalo',
  readPhone: 'Propusimos nombre, concentración y caducidad. Nada se guarda hasta que tocas Guardar.',
  readWeb: 'Propusimos nombre, concentración y caducidad. Nada se guarda hasta que haces clic en Guardar.',
  noTextTitle: 'No encontramos texto',
  noTextBody: 'Captúralo a mano. La foto se guarda con el medicamento.',
  readTag: 'Leído de tu foto',
  recipeTag: 'De la receta',
  name: 'Nombre',
  namePlaceholder: 'Como viene en la caja',
  strength: 'Concentración',
  strengthPlaceholder: 'p. ej. 160 mg/5 ml',
  quantity: 'Cantidad',
  unit: 'Unidad',
  expires: 'Caducidad',
  month: 'Mes',
  year: 'Año',
  day: 'Día (opcional)',
  note: 'Nota',
  notePlaceholder: 'Dónde está guardado, quién lo abrió…',
  save: 'Guardar en el botiquín',
  saveEdit: 'Guardar cambios',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  saveFailed: 'No se pudo guardar. Inténtalo de nuevo.',
  limitReached: 'El botiquín ya tiene el máximo de medicamentos. Quita uno para agregar otro.',
  leaveConfirm: 'Lo que escribiste no se ha guardado. ¿Salir de todos modos?',
  viewPhoto: 'Ver foto',
  photoViewer: 'Foto de la caja',
  edit: 'Editar',
  remove: 'Quitar del botiquín',
  removing: 'Quitando…',
  removeTitle: (name: string) => `¿Quitar ${name}?`,
  removeBody: 'Se quita del botiquín de la familia. No se puede deshacer.',
  removeFailed: 'No se pudo quitar. Inténtalo de nuevo.',
  notFound: 'No se encontró este medicamento.',
  backToList: 'Volver al botiquín',
  shortcut: 'Agregar al botiquín',
  required: {
    name: 'Escribe el nombre del medicamento.',
    quantity: 'Escribe la cantidad (de 0 a 999).',
    unit: 'Elige la unidad.',
    expires: 'Elige el mes y el año de la caducidad.',
    day: 'Ese día no existe en ese mes.',
  },
  labels: { strength: 'Concentración', quantity: 'Cantidad', expires: 'Caduca', note: 'Nota' },
}

const UNIT_ONE: Record<CabinetUnit, string> = { box: 'caja', tablet: 'tableta', bottle: 'frasco', ml: 'ml' }
const UNIT_MANY: Record<CabinetUnit, string> = { box: 'cajas', tablet: 'tabletas', bottle: 'frascos', ml: 'ml' }

/** The chips of the form: «cajas», «tabletas», «frascos», «ml». */
export const unitLabel = (unit: CabinetUnit) => UNIT_MANY[unit]

/** «2 frascos», «1 caja», «20 tabletas», «100 ml». */
export function quantityText(quantity: number, unit: CabinetUnit): string {
  return `${quantity} ${quantity === 1 ? UNIT_ONE[unit] : UNIT_MANY[unit]}`
}

/** «mar 2027» or «12 mar 2027»: only the date the parent typed, nothing else. */
export function expiresDate(e: Expires): string {
  return e.day ? `${e.day} ${MONTHS[e.month - 1]} ${e.year}` : `${MONTHS[e.month - 1]} ${e.year}`
}

/** «Caduca: mar 2027», with the same style as the quantity. */
export const expiresLine = (e: Expires) => `Caduca: ${expiresDate(e)}`

/** «7 medicamentos en el botiquín» (the home's entry). */
export const entryCount = (n: number) => (n === 1 ? '1 medicamento en el botiquín' : `${n} medicamentos en el botiquín`)

/** «7 medicamentos» or, searching, «2 de 7 medicamentos». */
export function listCount(shown: number, total: number, searching: boolean): string {
  const word = total === 1 ? 'medicamento' : 'medicamentos'
  return searching ? `${shown} de ${total} ${word}` : `${total} ${word}`
}

export const noResults = (q: string) => `Ningún medicamento del botiquín se llama «${q}».`

/** «Agregado por Ana · 6 nov». */
export function addedBy(name: string, at: string): string {
  const d = new Date(at)
  return `Agregado por ${name} · ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** «Editado por Luis · 7 nov». */
export function editedBy(name: string, at: string): string {
  const d = new Date(at)
  return `Editado por ${name} · ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** «Desde la consulta del 18 oct · Dra. Laura Cázares. El nombre viene de la receta; puedes cambiarlo.» */
export function fromConsultation(consultDate: string, doctor: string): { lead: string; rest: string } {
  const day = formatDateShort(consultDate).replace(/ \d{4}$/, '')
  return { lead: `Desde la consulta del ${day}`, rest: ` · ${doctor}. El nombre viene de la receta; puedes cambiarlo.` }
}

/** «Agregar Amoxicilina al botiquín» (the shortcut's accessible name). */
export const shortcutName = (medication: string) => `Agregar ${medication} al botiquín`
