// specs/056 (research R9): every sentence of the child's detail lives here, so one test (childDetailText.test.ts) can read them
// all. They count what was registered and never evaluate it: no «debes», «atrasado», «falta», percentages, praise or scolding
// (Principio I).

import { formatAgeLong } from '../../shared/age'
import { formatDateShort, formatDayMonth } from '../../shared/date'

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const CHILD = {
  today: 'Hoy',
  nothingToday: 'Hoy no hay tomas ni actividades',
  allMarked: '✓ Todo marcado hasta ahora',
  unregistered: 'sin registrar',
  mark: 'Marcar',
  activities: 'Actividades',
  done: '✓ Realizado',
  retry: 'Reintentar',
  supplement: 'Suplemento',
  treatment: 'Tratamiento activo',
  sections: 'Secciones',
  consultations: 'Consultas',
  supplements: 'Suplementos',
  cartilla: 'Cartilla',
  cartillaTitle: 'Cartilla de vacunación',
  cartillaLink: 'Ver cartilla',
  cartillaAdd: 'Agregar dosis o fotos',
  cartillaNote: 'Lo registrado es lo que tú capturaste. PediTrack no lo compara con ningún esquema.',
  noConsultations: 'Aún no hay consultas',
  noConsultationsText: 'Con «Nueva consulta» registras la fecha, el doctor, el motivo y los medicamentos que te indicaron.',
  search: 'Buscar en el historial',
  more: 'Lo demás',
  childAccess: 'Acceso del hijo',
  createLink: 'Crear liga',
  familyWhoSees: 'Familia que lo ve',
  newConsultation: 'Nueva consulta',
  planMark: 'Plan completo',
  notFound: 'No se encontró este hijo.',
  loadFailedList: 'No pudimos cargar sus consultas.',
  backHome: '← Inicio',
  summary: 'Resumen del día',
  summaryDoses: 'Tomas',
  summaryUnregistered: 'Sin registrar',
  summaryNext: 'Próxima toma',
  noneToday: 'Ninguna hoy',
} as const

/** «5 años 6 meses · nació el 14 mar 2021». */
export const childSubtitle = (birthDate: string) => `${formatAgeLong(birthDate)} · nació el ${formatDateShort(birthDate)}`
/** «7 tomas hoy». */
export const dosesToday = (count: number) => `${n(count, 'toma', 'tomas')} hoy`
export const toMarkChip = (count: number) => `${count} por marcar`
export const unregisteredChip = (count: number) => `${count} sin registrar`
/** «2 de 5 hechas». */
export const activitiesDone = (done: number, total: number) => `${done} de ${total} ${total === 1 ? 'hecha' : 'hechas'}`
/** «Próxima: Lavarse las manos · 14:00». */
export const nextActivity = (name: string, time: string) => `Próxima: ${name} · ${time}`
/** «✓ Lavarse las manos · 13:22», for a minute after «Realizado». */
export const doneLine = (name: string, time: string) => `✓ ${name} · ${time}`
/** The fixed accessible name of a dose's toggle (its state is `aria-pressed`). */
export const markLabel = (name: string, time: string) => `Marcar ${name} de las ${time}`
export const loadFailedDay = (child: string) => `No pudimos cargar el día de ${child}`
/** «7 hoy · 2 por marcar» / «7 hoy · 5 marcadas» (the web's «Resumen del día»). */
export const summaryDoses = (total: number, toMark: number, marked: number) =>
  toMark > 0 ? `${total} hoy · ${toMark} por marcar` : `${total} hoy · ${marked} ${marked === 1 ? 'marcada' : 'marcadas'}`
/** «Vitamina D · 08:00». */
export const nameAtTime = (name: string, time: string) => `${name} · ${time}`
/** «Amoxicilina +1». */
export const treatmentName = (name: string, others: number) => (others > 0 ? `${name} +${others}` : name)
export const treatmentEnds = (endsAt: string) => `termina el ${formatDayMonth(endsAt)}`
/** «1 teléfono» / «2 teléfonos». */
export const phones = (count: number) => n(count, 'teléfono', 'teléfonos')
/** «Sin suplementos registrados» / «Sin actividades registradas». */
export const emptyRoutines = (kind: 'supplement' | 'activity') =>
  kind === 'activity' ? 'Sin actividades registradas' : 'Sin suplementos registrados'
export const addRoutine = (kind: 'supplement' | 'activity') => (kind === 'activity' ? '+ Agregar actividad' : '+ Agregar suplemento')
export const planRoutines = (kind: 'supplement' | 'activity') => (kind === 'activity' ? 'Agregar actividades' : 'Agregar suplementos')
