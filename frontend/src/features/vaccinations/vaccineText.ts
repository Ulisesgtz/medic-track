import { formatDateShort } from '../../shared/date'
import type { Vaccination } from './types'

// Every sentence of the vaccination card lives here (specs/046), so one test can read them all. The card records what the parent
// captured and never interprets it: nothing here says what is due, late or complete, gives advice or uses a color of alert (Principio I).

export const TEXT = {
  title: 'Cartilla de vacunación',
  /** FR-017: always on screen. */
  note: 'Lo registrado es lo que tú capturaste. No sustituye la cartilla ni el criterio de tu médico.',
  back: '← Volver',
  loading: 'Cargando la cartilla…',
  loadError: 'No pudimos cargar la cartilla.',
  retry: 'Reintentar',
  empty: {
    title: 'Aún no hay vacunas registradas',
    body: 'Puedes anotarlas a mano o guardar una foto de la cartilla de papel.',
  },
  add: '+ Agregar vacuna',
  edit: 'Corregir',
  remove: 'Borrar',
  dose: 'Dosis',
  entry: {
    empty: 'Sin vacunas registradas',
    link: 'Abrir la cartilla →',
  },
  dialog: {
    addTitle: 'Agregar vacuna',
    editTitle: 'Corregir vacuna',
    vaccine: 'Vacuna',
    other: 'Otra…',
    chooseVaccine: 'Elige una vacuna',
    customName: 'Nombre de la vacuna',
    appliedOn: 'Fecha de aplicación',
    doseNumber: 'Dosis (opcional)',
    lot: 'Lote (opcional)',
    place: 'Lugar o médico (opcional)',
    notes: 'Nota (opcional)',
    save: 'Guardar',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    close: 'Cerrar',
    saveAnyway: 'Guardar de todos modos',
    duplicate: 'Ya tienes esta vacuna con esta dosis y fecha.',
    saveError: 'No se pudo guardar. No se perdió nada de lo que escribiste. Inténtalo de nuevo.',
    leave: 'Si sales, se pierde lo que escribiste.',
  },
  errors: {
    vaccine: 'Elige una vacuna o escribe su nombre.',
    customName: 'El nombre puede tener hasta 100 caracteres.',
    appliedOn: 'Escribe la fecha en que se aplicó.',
    future: 'La fecha de aplicación no puede ser futura.',
    beforeBirth: 'La fecha de aplicación no puede ser anterior al nacimiento.',
    dose: 'La dosis es un número del 1 al 20.',
    lot: 'El lote puede tener hasta 60 caracteres.',
    place: 'El lugar puede tener hasta 120 caracteres.',
    notes: 'La nota puede tener hasta 500 caracteres.',
  },
  photos: {
    title: 'Fotos de la cartilla',
    add: 'Guardar foto de la cartilla',
    saving: 'Guardando la foto…',
    empty: 'Aún no hay fotos de la cartilla.',
    privacy: 'El texto se lee en tu equipo; la foto se guarda solo en tu cuenta.',
    open: 'Abrir',
    remove: 'Borrar',
    viewerLabel: 'Foto de la cartilla',
    loadError: 'No pudimos cargar las fotos.',
    openError: 'No se pudo abrir la foto. Inténtalo de nuevo.',
    saveError: 'No se pudo guardar la foto. No se perdió nada. Inténtalo de nuevo.',
    notShrunk: 'No pudimos reducir la foto; se guardó tal cual.',
    deleteTitle: '¿Borrar esta foto?',
    deleteError: 'No se pudo borrar la foto. No se cambió nada. Inténtalo de nuevo.',
  },
  proposed: {
    title: 'Leído de tu cartilla',
    reading: 'Leyendo la cartilla…',
    help: 'Revisa cada fila: puedes corregirla, descartarla o guardarla. No se guarda nada hasta que lo confirmes.',
    none: 'No encontramos vacunas en la foto. Puedes capturarlas a mano.',
    include: 'Guardar esta fila',
    confirmOne: 'Guardar',
    confirmSelected: 'Guardar las seleccionadas',
    discard: 'Descartar',
    discardAll: 'Descartar todo',
    saving: 'Guardando…',
    fixDate: 'Escribe la fecha de aplicación.',
    saveError: 'No se pudo guardar. Inténtalo de nuevo.',
  },
  confirmDelete: {
    title: '¿Borrar esta vacuna?',
    confirm: 'Borrar',
    cancel: 'Cancelar',
    busy: 'Borrando…',
    error: 'No se pudo borrar. No se cambió nada. Inténtalo de nuevo.',
  },
}

/** «Dosis 2 · 14 mar 2021 · Centro de salud»: only what was recorded. */
export function doseLine(v: Pick<Vaccination, 'doseNumber' | 'appliedOn' | 'place'>): string {
  const parts = [v.doseNumber ? `${TEXT.dose} ${v.doseNumber}` : '', formatDateShort(v.appliedOn), v.place ?? '']
  return parts.filter(Boolean).join(' · ')
}

/** «Corregida el 5 nov 2026 por Ana», or '' for a dose nobody corrected. The name is the first name, never an e-mail. */
export function correctedLine(v: Pick<Vaccination, 'correctedAt' | 'correctedByName'>): string {
  if (!v.correctedAt) return ''
  const d = new Date(v.correctedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = formatDateShort(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  return `Corregida el ${day}${v.correctedByName ? ` por ${v.correctedByName}` : ''}`
}

/** The name of a dose for a button that acts on it: «Hepatitis B del 14 mar 2021» (so «Corregir» and «Borrar» say which). */
export function groupLabel(v: Pick<Vaccination, 'name' | 'appliedOn'>): string {
  return `${v.name} del ${formatDateShort(v.appliedOn)}`
}

/** What the delete confirmation says: what goes, and that it can't be undone (a dose is deleted for good). */
export function deleteRows(v: Pick<Vaccination, 'name' | 'appliedOn'>): { k: string; v: string }[] {
  return [
    { k: 'Se borra', v: `La dosis de ${v.name} del ${formatDateShort(v.appliedOn)}.` },
    { k: 'No se puede deshacer', v: 'Las demás vacunas y las fotos de la cartilla no cambian.' },
  ]
}

/** «3 dosis registradas · 2 fotos», or the empty sentence. */
export function entrySummary(doses: number, photos: number): string {
  if (doses === 0 && photos === 0) return TEXT.entry.empty
  const dosesText = doses === 1 ? '1 dosis registrada' : `${doses} dosis registradas`
  const photosText = photos === 0 ? '' : photos === 1 ? ' · 1 foto' : ` · ${photos} fotos`
  return `${dosesText}${photosText}`
}

/** «Ya guardaste 10 fotos de esta cartilla. Borra una para guardar otra.» */
export function photoLimitText(limit: number): string {
  return `Ya guardaste ${limit} fotos de esta cartilla. Borra una para guardar otra.`
}

/** «Guardada por Ana el 05 nov 2026» for a thumbnail: who saved it and when (the first name, never an e-mail). */
export function photoLine(p: { createdAt: string; createdByName: string }): string {
  const d = new Date(p.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = formatDateShort(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  return `Guardada${p.createdByName ? ` por ${p.createdByName}` : ''} el ${day}`
}

/** The rows of the confirmation to delete a photo. */
export function deletePhotoRows(p: { createdAt: string; createdByName: string }): { k: string; v: string }[] {
  return [
    { k: 'Se borra', v: `${photoLine(p)}.` },
    { k: 'No se puede deshacer', v: 'Las vacunas anotadas y las demás fotos no cambian.' },
  ]
}
