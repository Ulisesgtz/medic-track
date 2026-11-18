// Every text of the merge flow (specs/074-unir-hijo-duplicado/contracts/ui.md and the mock «Unir hijos duplicados PediTrack»).
// Neutral Spanish: it never says which record is "the right one", never recommends and never congratulates (Principio I).
import { formatDateShortNoPad } from '../../../shared/date'
import { namesText } from '../roles'
import type { DifferenceField, MergeChild, MergeCounts, MergePairPreview, Side } from './types'

export const SAME_NAME = 'Se llaman igual'
export const SAME_NAME_HINT = 'Es una sugerencia; puedes cambiarla.'
export const MERGE_ERROR = 'No se pudo unir. No cambió nada.'
export const NOT_NONE = 'No es ninguno'

export const mergeWarning = (ownerFirstName: string) =>
  `Todo pasa a la familia de ${ownerFirstName}. Si después sales de la familia, no te llevas copia. Esto no se puede deshacer.`

export const FIELD_LABELS: Record<DifferenceField, string> = {
  firstName: 'Nombre',
  lastName: 'Apellido',
  birthDate: 'Fecha de nacimiento',
  height: 'Talla',
  weight: 'Peso',
  growthReferenceSex: 'Tabla de crecimiento',
  bloodType: 'Tipo de sangre',
  pediatrician: 'Pediatra de cabecera',
  generalNote: 'Nota general',
}

export const COUNT_LABELS: Record<keyof MergeCounts, [string, string]> = {
  consultations: ['consulta', 'consultas'],
  vaccines: ['vacuna', 'vacunas'],
  cardPhotos: ['foto de la cartilla', 'fotos de la cartilla'],
  measurements: ['medida', 'medidas'],
  supplements: ['suplemento', 'suplementos'],
  activities: ['actividad', 'actividades'],
  activeDevices: ['teléfono del hijo', 'teléfonos del hijo'],
}

export function countText(key: keyof MergeCounts, n: number): string {
  const [one, many] = COUNT_LABELS[key]
  return `${n} ${n === 1 ? one : many}`
}

/** «2 consultas · 9 vacunas»; kinds with zero are left out; empty when there is nothing. */
export function countsSummary(counts: Partial<MergeCounts>): string {
  return (Object.keys(COUNT_LABELS) as (keyof MergeCounts)[])
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => countText(k, counts[k] as number))
    .join(' · ')
}

/** What a child holds, as the pairing and summary lines say it: «2 consultas · 9 vacunas · 1 medida · ficha». */
export function holdingsLine(counts: Partial<MergeCounts>, hasRecord: boolean): string {
  const parts = [countsSummary({ ...counts, activeDevices: 0 })]
  if (hasRecord) parts.push('ficha')
  return parts.filter(Boolean).join(' · ')
}

export const sideLabel = (side: Side) => (side === 'own' ? 'El tuyo' : 'El de la familia')

export const OWN_TAG = 'Tuyo'
export const FAMILY_TAG = 'Familia'

// A and A2: «¿Cómo quieres seguir?»
export const HOW = {
  title: '¿Cómo quieres seguir?',
  eyebrow: (ownerFirstName: string) => `Familia de ${ownerFirstName}`,
  intro: (ownerFirstName: string) =>
    `Ya eres parte de la familia de ${ownerFirstName}. Tú ya tenías hijos registrados; si alguno es el mismo niño, puede aparecer dos veces.`,
  ownTitle: 'Tus hijos',
  familyTitle: (ownerFirstName: string) => `Familia de ${ownerFirstName}`,
  legend: 'Elige una opción',
  merge: { title: 'Unir', body: 'Junta lo que anotaste con el hijo de la familia.' },
  hide: { title: 'Usar solo lo de la familia', body: 'Tus hijos se ocultan; no se borra nada y puedes volver a mostrarlos.' },
  keep: { title: 'Conservar ambas', body: 'Verás los dos registros; puedes unirlos después desde Familia.' },
  keepCaregiver: { title: 'Conservar ambas', body: 'Verás los dos registros. Un Tutor o el titular puede unirlos después desde Familia.' },
  next: 'Continuar',
  pickToContinue: 'Elige una opción para continuar.',
  saving: 'Guardando…',
  hideFailed: 'No pudimos ocultar tus hijos. No cambió nada. Inténtalo de nuevo.',
  loadFailed: 'No pudimos cargar tus hijos y los de la familia. Revisa tu conexión e inténtalo de nuevo.',
  retry: 'Reintentar',
  loading: 'Cargando…',
}

// F: «Conservar ambas»
export const KEPT = {
  title: 'Quedan los dos registros',
  body: 'Un mismo niño puede aparecer dos veces: el que tú anotaste y el de la familia. No se borró ni se cambió nada.',
  laterTitle: '¿Quieres unirlos después?',
  later: 'Entra a Familia y elige «Unir con un hijo de la familia».',
  home: 'Ir al inicio',
  family: 'Ver Familia',
}

// B and B2: the pairs
export const PAIRS = {
  back: '← ¿Cómo quieres seguir?',
  eyebrow: 'Unir hijos',
  title: 'Empareja a tus hijos',
  intro: 'Para cada hijo tuyo, elige si es el mismo que uno de la familia. Cada hijo de la familia se puede elegir una sola vez.',
  label: 'Es el mismo que…',
  familySuffix: 'familia',
  taken: (ownFirstName: string) => `Ya lo elegiste en tu ${ownFirstName}`,
  summary: (pairs: number, unpaired: number) => `${pairs} ${pairs === 1 ? 'pareja' : 'parejas'} · ${unpaired} sin pareja`,
  pickOne: 'Elige al menos una pareja para continuar.',
  next: 'Continuar',
  checking: 'Revisando…',
  failed: 'No pudimos preparar el resumen. No cambió nada. Inténtalo de nuevo.',
  notAllowed: 'Ya no puedes unir estos registros. No cambió nada.',
  notAvailable: 'Unir no está disponible para tu cuenta ahora.',
}

// C and C2: the data that differ
export const DIFF = {
  back: '← Parejas',
  backPrev: '← Datos distintos',
  eyebrow: (ownFirstName: string) => `${ownFirstName} · unir`,
  title: 'Datos distintos',
  intro: (ownFirstName: string) =>
    `Estos datos de ${ownFirstName} son distintos en los dos registros. Elige cuál se queda en cada uno. Los que coinciden no aparecen aquí.`,
  chosen: (done: number, total: number) => `${done} de ${total} elegidos`,
  toContinue: (total: number) => (total === 1 ? 'Elige el dato para continuar' : `Elige los ${total} para continuar`),
  listsJoin: 'Las alergias y los padecimientos de los dos registros se juntan. No tienes que elegir.',
  next: 'Continuar',
  empty: 'Sin anotar',
}

/** «0 de 4 elegidos · Elige los 4 para continuar», beside the disabled button. */
export const diffStatus = (done: number, total: number) => `${DIFF.chosen(done, total)} · ${DIFF.toContinue(total)}`

const SEX_LABEL: Record<string, string> = { female: 'Niña', male: 'Niño' }

/** The value a child has in a field, as the family wrote it («3 mar 2022», «16.2 kg», «Dr. Iván Robles · 33 2345 6789»). */
export function fieldValue(field: DifferenceField, child: MergeChild): string {
  const blank = (s: string | null | undefined) => (s ?? '').trim()
  let text = ''
  switch (field) {
    case 'firstName':
      text = blank(child.firstName)
      break
    case 'lastName':
      text = blank(child.lastName)
      break
    case 'birthDate':
      text = formatDateShortNoPad(child.birthDate)
      break
    case 'height':
      text = child.height === null || child.height === undefined ? '' : `${child.height} cm`
      break
    case 'weight':
      text = child.weight === null || child.weight === undefined ? '' : `${child.weight} kg`
      break
    case 'growthReferenceSex':
      text = child.growthReferenceSex ? (SEX_LABEL[child.growthReferenceSex] ?? child.growthReferenceSex) : ''
      break
    case 'bloodType': {
      const b = blank(child.record.bloodType)
      text = b === 'unknown' ? 'No lo sé' : b.replace('-', '−')
      break
    }
    case 'pediatrician': {
      const p = child.record.pediatrician
      text = [p?.name, p?.phone, p?.office].map(blank).filter(Boolean).join(' · ')
      break
    }
    case 'generalNote':
      text = blank(child.record.generalNote)
      break
  }
  return text === '' ? DIFF.empty : text
}

// D and D2: the summary
export const SUMMARY = {
  back: '← Datos distintos',
  backPairs: '← Parejas',
  eyebrow: 'Antes de unir',
  title: 'Revisa el resumen',
  intro: 'Esto es lo que va a pasar.',
  joinHeading: 'Se unen',
  unchanged: 'No se une. Sigue como está.',
  noticeLead: 'Un aviso antes de unir.',
  download: 'Descargar mis datos',
  downloading: 'Preparando tu archivo…',
  downloadFailed: 'No pudimos preparar tu archivo. Inténtalo de nuevo.',
  merge: 'Unir',
  tooLongLead: 'Todavía no se puede unir.',
  openRecord: 'Abrir la ficha',
}

export const pairHeading = (ownFirstName: string, familyFirstName: string) => `${ownFirstName} (tuyo) → ${familyFirstName} (familia)`

const LIMIT_WORDS: Record<string, string> = {
  supplements: 'suplementos activos',
  activities: 'actividades activas',
  cardPhotos: 'fotos de la cartilla',
  measurements: 'medidas de crecimiento',
  consultationPhotos: 'consultas con foto en la cuenta de la familia',
}

type OverLimit = MergePairPreview['overLimits'][number]

/** «12 suplementos activos» for one kind that goes over its cap; the kinds we don't know are left out. */
export function limitWords(o: OverLimit): string | null {
  const w = LIMIT_WORDS[o.kind]
  return w ? `${o.resulting} ${w}` : null
}

export function quedaraCon(o: OverLimit): string | null {
  const w = limitWords(o)
  return w ? `Quedará con ${w}` : null
}

export function limitNotice(childFirstName: string, o: OverLimit): string | null {
  const w = limitWords(o)
  if (!w) return null
  return `${childFirstName} tendrá ${w}; no podrás agregar más hasta tener ${o.limit} o menos. No se quita ninguno.`
}

export const phoneLine = (ownFirstName: string, devices: number) =>
  devices === 1
    ? `${ownFirstName} usa su teléfono con una liga de acceso: ese acceso se cierra al unir.`
    : `${ownFirstName} usa ${devices} teléfonos con una liga de acceso: esos accesos se cierran al unir.`

export const tooLongLine = (ownFirstName: string, list: string, resulting: number, limit: number) =>
  `La ficha de ${ownFirstName} quedaría con ${resulting} ${list === 'conditions' ? 'padecimientos' : 'alergias'} y el máximo es ${limit}. Quita alguno desde su ficha y vuelve a intentarlo.`

// E1, E2, E3
export const DONE = {
  merging: (names: string) => `Uniendo a ${names}`,
  keepOpen: 'Puedes dejar esta pantalla abierta. No cierres la app hasta que termine.',
  merged: (names: string[]) => (names.length === 1 ? `Se unió ${names[0]}` : `Se unieron ${namesText(names)}`),
  mergedBody: (ownerFirstName: string, moves: MergePairPreview['moves'] | undefined) => {
    const parts = moves
      ? (['consultations', 'vaccines', 'cardPhotos', 'measurements', 'supplements', 'activities'] as const)
          .filter((k) => moves[k] > 0)
          .map((k) => countText(k, moves[k]))
      : []
    if (moves?.record) parts.push('su ficha')
    const list = parts.length === 0 ? '' : ` con sus ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`}`
    return `Ahora está en la familia de ${ownerFirstName}${list}.`
  },
  someFailed: (names: string[]) => `No se pudo unir ${namesText(names)}. No cambió nada en ${names.length === 1 ? 'ese registro' : 'esos registros'}.`,
  home: 'Ir al inicio',
  failedTitle: 'No se pudo unir',
  failedBody: 'No cambió nada. Tus hijos y los de la familia siguen como estaban.',
  retry: 'Intentar de nuevo',
  backToSummary: 'Volver al resumen',
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// G: the line in the child's detail. The year only when it is not this one.
export function mergedLine(at: string, byFirstName: string | null | undefined, now: Date = new Date()): string {
  const d = new Date(at)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`
  const who = (byFirstName ?? '').trim()
  return who === '' ? `Se unió el ${base}` : `Se unió el ${base} con el registro de ${who}`
}

// H1, H2, H3
export const HIDDEN = {
  back: '← Mi cuenta',
  eyebrow: 'Mi cuenta',
  title: 'Hijos ocultos',
  intro: (ownerFirstName: string | null) =>
    ownerFirstName ? `Los ocultaste al unirte a la familia de ${ownerFirstName}. No se borró nada.` : 'Los ocultaste. No se borró nada.',
  show: 'Volver a mostrar',
  showing: 'Mostrando…',
  note: 'Los hijos ocultos se incluyen en «Descargar todos mis datos».',
  failed: 'No pudimos volver a mostrar a este hijo. Inténtalo de nuevo.',
  downloadAll: 'Descargar todos mis datos',
}

export const FAMILY_SECTION = {
  title: 'Tus hijos y los de la familia',
  visibleBody: 'Tenías hijos registrados antes de unirte. Si alguno es el mismo niño de la familia, puedes unirlos.',
  hiddenBody: 'Tus hijos están ocultos. No se borró nada y los datos siguen en tu cuenta.',
  merge: 'Unir con un hijo de la familia',
  hide: 'Ocultar mis hijos',
  showAll: 'Volver a mostrar mis hijos',
  failed: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
}
