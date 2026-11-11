// specs/056 (research R9): the sentences of the consultation's detail, in one place so one test (consultationDetailText.test.ts)
// reads them all. They say what was registered and never evaluate it (Principio I).

import { formatTime } from '../../shared/date'
import type { TakenBy } from './types'

export const DETAIL = {
  treatment: 'Tratamiento',
  recordOnly: 'Solo registro · no genera tomas',
  data: 'Datos de la consulta',
  receipt: 'Receta',
  seeReceipt: 'Ver receta completa',
  photoNote: 'El texto se leyó en tu equipo; la foto se guarda solo en tu cuenta.',
  noPhoto: 'Esta consulta se guardó sin foto.',
  symptoms: 'Síntomas',
  notes: 'Notas',
  noDayDoses: 'Este día no tiene tomas.',
  toMark: 'por marcar',
  unregistered: 'sin registrar',
  canceled: 'cancelada',
  scheduled: 'programada',
  mark: 'Marcar',
  allMarkedToday: '✓ Todo marcado hasta ahora',
  allMarked: '✓ Todo marcado',
  notFound: 'No se encontró esta consulta.',
  loadFailed: 'la consulta',
  appointmentFailed: 'La consulta se guardó, pero no se pudo guardar la próxima cita. Agrégala desde aquí.',
  newConsultation: 'Nueva consulta',
} as const

/** «En curso · termina el 4 nov». */
export const inProgress = (endDay: string) => `En curso · termina el ${endDay}`
/** «Terminado el 21 oct». */
export const finished = (endDay: string) => `Terminado el ${endDay}`
export const toMarkChip = (count: number) => `${count} por marcar`
export const unregisteredChip = (count: number) => `${count} sin registrar`
/** «Tomas de hoy» / «Tomas del 20 de octubre» (the doses of the day chosen in the calendar, under it). */
export const dayTitle = (isToday: boolean, longDay: string) => (isToday ? 'Tomas de hoy' : `Tomas del ${longDay}`)
/** «Foto · 3 síntomas · notas» (the folded row of «Datos de la consulta»). */
export function dataSummary(hasPhoto: boolean, symptoms: number, hasNotes: boolean): string {
  const parts = [hasPhoto ? 'Foto' : 'Sin foto']
  if (symptoms > 0) parts.push(`${symptoms} ${symptoms === 1 ? 'síntoma' : 'síntomas'}`)
  if (hasNotes) parts.push('notas')
  return parts.join(' · ')
}
/** «c/8 h · 7 días · primera toma 07:00» (a record-only medication has no first dose). */
export function scheduleLine(frequencyHours: number, durationDays: number, startTime: string | null | undefined): string {
  const days = durationDays === 1 ? '1 día' : `${durationDays} días`
  return [`c/${frequencyHours} h`, days, startTime ? `primera toma ${startTime}` : null].filter(Boolean).join(' · ')
}
/** «✓ 07:05 · por Ana»: when the mark was made and by whom (specs/032). */
export const takenLine = (takenBy: TakenBy | null | undefined, scheduledAt: string) =>
  // specs/066: an own mark the server hasn't answered yet has the hour of the tap and no name.
  takenBy ? (takenBy.name ? `✓ ${formatTime(takenBy.at)} · por ${takenBy.name}` : `✓ ${formatTime(takenBy.at)}`) : `✓ ${formatTime(scheduledAt)}`
