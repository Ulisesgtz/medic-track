import { formatDateShort } from '../../shared/date'
import type { Indicator } from './types'

// specs/063: every sentence of the growth record in one place, so growthText.test.ts can read them all. The app records and draws;
// nothing here says where a child stands, what is normal or what to do (Principio I).

export const GROWTH = {
  title: 'Crecimiento',
  subtitle: 'Peso y talla',
  backChild: (name: string) => `← ${name}`,
  add: 'Anotar medida',
  addTitle: 'Anotar medida',
  editTitle: 'Corregir medida',
  backGrowth: '← Crecimiento',
  emptyTitle: 'Aún no hay medidas',
  emptyBody: 'Anota el peso y la talla que te dé el pediatra en cada revisión.',
  loading: 'Cargando medidas',
  loadFailed: 'las medidas',
  listTitle: 'Medidas',
  weight: 'Peso',
  height: 'Talla',
  kg: 'kg',
  cm: 'cm',
  date: 'Fecha de la medida',
  weightLabel: 'Peso (kg)',
  heightLabel: 'Talla (cm)',
  note: 'Nota',
  optional: '(opcional)',
  notePlaceholder: 'Por ejemplo: medido en la consulta',
  bothOptional: 'Escribe el peso, la talla o los dos.',
  save: 'Guardar medida',
  saveEdit: 'Guardar cambios',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  leaveConfirm: 'Tienes una medida sin guardar. ¿Salir sin guardarla?',
  saveFailed: 'No pudimos guardar la medida. Revisa tu conexión e inténtalo de nuevo.',
  limitReached: 'Este perfil ya guarda 500 medidas, el máximo. Quita alguna para anotar otra.',
  notFound: 'No encontramos esta medida.',
  correct: 'Corregir',
  remove: 'Quitar',
  removeTitle: (date: string) => `¿Quitar la medida del ${date}?`,
  removeBody: 'Se quita de la lista y de la gráfica. No se puede deshacer.',
  removing: 'Quitando…',
  removeFailed: 'No pudimos quitar la medida. Inténtalo de nuevo.',
  registeredLead: (name: string) => `Anotado al registrar a ${name}, sin fecha:`,
  registeredAction: 'Anotarla con fecha',
  caregiverNote: 'Puedes ver las medidas. Una persona adulta de la familia con acceso completo las anota y las corrige.',
  chartTitle: 'Gráfica',
  showChart: 'Ver la gráfica',
  planBadge: 'Plan completo',
  chartLoading: 'Cargando la gráfica',
  chartFailed: 'No pudimos cargar la gráfica.',
  retry: 'Reintentar',
  chooseTableTitle: 'Tabla de referencia de la OMS',
  chooseTableBody: 'Las curvas de la OMS son distintas para niñas y para niños. Elige cuál dibujar; puedes cambiarla después.',
  girls: 'Niña',
  boys: 'Niño',
  tableIs: (sex: 'female' | 'male') => `Tabla de la OMS: ${sex === 'female' ? 'niña' : 'niño'}`,
  changeTable: 'Cambiar',
  tableFailed: 'No pudimos guardar la tabla. Inténtalo de nuevo.',
  chartFamilyPlan: 'La gráfica con la referencia de la OMS es parte del plan completo de la familia.',
  tableFromAdult: 'Una persona adulta de la familia con acceso completo puede elegir la tabla de la OMS para dibujar las curvas.',
  referenceOff: 'La referencia de la OMS aún no está disponible; la gráfica muestra solo las medidas anotadas.',
  noPoints: (indicator: Indicator) => (indicator === 'weight' ? 'Aún no hay medidas de peso.' : 'Aún no hay medidas de talla.'),
  fixedNote:
    'Las curvas grises son la referencia de la OMS para niñas y niños nacidos a término. La gráfica solo muestra lo anotado; quien la interpreta es el pediatra.',
  beyondWeight: 'La referencia de la OMS de peso para la edad llega a los 10 años.',
  beyondHeight: 'La referencia de la OMS de talla para la edad llega a los 19 años.',
  tableCaption: (indicator: Indicator) => (indicator === 'weight' ? 'Medidas de peso' : 'Medidas de talla'),
  ageColumn: 'Edad',
  valueColumn: (indicator: Indicator) => (indicator === 'weight' ? 'Peso' : 'Talla'),
  months: 'Edad en meses',
  years: 'Edad en años',
} as const

const number = (n: number) => String(n)

export function weightText(kg: number): string {
  return `${number(kg)} kg`
}

export function heightText(cm: number): string {
  return `${number(cm)} cm`
}

/** «12.4 kg · 86 cm», only the values written. */
export function valuesLine(weightKg: number | null, heightCm: number | null): string {
  return [weightKg != null ? weightText(weightKg) : null, heightCm != null ? heightText(heightCm) : null].filter(Boolean).join(' · ')
}

/** The detail's summary: «Última: 12.4 kg · 86 cm, 03 nov 2026». */
export function lastLine(m: { measuredOn: string; weightKg: number | null; heightCm: number | null }): string {
  return `Última: ${valuesLine(m.weightKg, m.heightCm)}, ${formatDateShort(m.measuredOn)}`
}

export function countLine(n: number): string {
  return n === 1 ? '1 medida' : `${n} medidas`
}

/** «Anotada por Ana» / «Corregida el 08 nov 2026 por Luis». */
export function authorLine(m: { createdBy: { name: string }; corrected: { at: string; by: { name: string } } | null }): string {
  if (m.corrected) return `Corregida el ${formatDateShort(m.corrected.at.slice(0, 10))} por ${m.corrected.by.name}`
  return `Anotada por ${m.createdBy.name}`
}

/** A chart point's name: «03 nov 2026 · 12.4 kg · 1 año 5 meses». */
export function pointLabel(date: string, indicator: Indicator, value: number, age: string): string {
  return `${formatDateShort(date)} · ${indicator === 'weight' ? weightText(value) : heightText(value)} · ${age}`
}
