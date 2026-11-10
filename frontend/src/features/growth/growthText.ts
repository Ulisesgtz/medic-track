import { formatDateShort, formatDateShortNoPad } from '../../shared/date'
import type { Indicator, ReferenceSex } from './types'

// specs/063 + 065: every sentence of the growth record in one place, so growthLogic.test.ts can read them all. The words are the
// mock's (specs/065-rediseno-crecimiento/referencia). The app records and draws; nothing here says where a child stands, what is
// normal or what to do (Principio I).

export const GROWTH = {
  title: 'Crecimiento',
  subtitle: 'Peso y talla',
  backChild: (name: string) => `← ${name}`,
  add: 'Anotar medida',
  addPlus: '+ Anotar medida',
  addTitle: 'Anotar medida',
  editTitle: 'Corregir medida',
  backGrowth: '← Crecimiento',
  // The child's detail (GrowthSection) keeps its own short line.
  emptyTitle: 'Aún no hay medidas',
  loadFailed: 'las medidas',
  // «Última medida»
  latest: 'Última medida',
  // The signup's values, without a date.
  registeredSection: 'Medida del registro',
  registeredLead: (name: string) => `Al registrar a ${name}`,
  registeredWhy: 'Sin fecha, por eso no aparece en la gráfica.',
  registeredAction: 'Anotarla con fecha',
  // Read-only
  caregiverLead: 'Vista de Cuidadora.',
  readOnlyLead: 'Solo lectura.',
  readOnlyBody: 'Puedes ver las medidas. Anotarlas lo hace la familia.',
  // Empty
  emptyLong: 'Aún no hay medidas anotadas',
  emptyBody: 'Anota el peso, la talla o los dos, con la fecha en que se midieron.',
  emptyAction: 'Anotar la primera medida',
  // The chart
  chartSection: 'Gráfica de crecimiento',
  tabsLabel: 'Medida en la gráfica',
  rangeLabel: 'Rango de edad',
  weight: 'Peso',
  height: 'Talla',
  previous: 'Medida anterior',
  next: 'Medida siguiente',
  chartName: (indicator: Indicator, name: string) =>
    `Gráfica de ${indicator === 'weight' ? 'peso' : 'talla'} de ${name}. Los mismos datos están en Medidas anotadas.`,
  noPoints: (indicator: Indicator) => (indicator === 'weight' ? 'Aún no hay medidas de peso.' : 'Aún no hay medidas de talla.'),
  chartLoading: 'Cargando la gráfica',
  chartFailed: 'No pudimos cargar la gráfica.',
  retry: 'Reintentar',
  inviteTitle: 'Elige la tabla de la OMS para ver las curvas de referencia.',
  inviteBody: (name: string) => `Por ahora ves solo las medidas de ${name}.`,
  inviteReadOnly: (name: string, owner: string | null) =>
    `Por ahora ves solo las medidas de ${name}. La tabla de la OMS la elige ${owner ?? 'la familia'}.`,
  tablePick: 'Curvas de la OMS para',
  tableGroup: 'Tabla de la OMS',
  girls: 'Niña',
  boys: 'Niño',
  tableChosenBy: (sex: ReferenceSex, owner: string | null) =>
    `Curvas de la OMS para ${sex === 'female' ? 'niña' : 'niño'}. La tabla la elige ${owner ?? 'la familia'}.`,
  tableFailed: 'No pudimos guardar la tabla. Inténtalo de nuevo.',
  referenceOff: 'La referencia de la OMS aún no está disponible; la gráfica muestra solo las medidas anotadas.',
  whoNote: 'Las curvas son la referencia de la OMS para niñas y niños nacidos a término.',
  whoNoteStrong: 'Tu pediatra es quien interpreta la gráfica.',
  beyondWeight: 'La referencia de la OMS de peso para la edad llega a los 10 años.',
  beyondHeight: 'La referencia de la OMS de talla para la edad llega a los 19 años.',
  // The free plan
  planBadge: 'Plan completo',
  lockedBody: (name: string) => `Con el Plan completo ves las medidas de ${name} sobre las curvas de la OMS.`,
  showChart: 'Ver la gráfica',
  // The list / table
  listTitle: 'Medidas anotadas',
  colDate: 'Fecha',
  colAge: 'Edad',
  colWeight: 'Peso',
  colHeight: 'Talla',
  colBy: 'Anotada por',
  colActions: 'Acciones',
  noWeight: 'Sin peso anotado',
  noHeight: 'Sin talla anotada',
  correct: 'Corregir',
  remove: 'Quitar',
  removeTitle: (date: string) => `¿Quitar la medida del ${date}?`,
  removeBody: 'Se quita de la lista y de la gráfica. No se puede deshacer.',
  removing: 'Quitando…',
  removeFailed: 'No pudimos quitar la medida. Inténtalo de nuevo.',
  // The form
  date: 'Fecha',
  weightLabel: 'Peso',
  heightLabel: 'Talla',
  kg: 'kg',
  cm: 'cm',
  note: 'Nota',
  optional: '(opcional)',
  notePlaceholder: 'Por ejemplo: con ropa ligera',
  bothOptional: 'Puedes anotar solo el peso o solo la talla.',
  save: 'Guardar medida',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  leaveConfirm: 'Tienes una medida sin guardar. ¿Salir sin guardarla?',
  saveFailed: 'No pudimos guardar la medida. Revisa tu conexión e inténtalo de nuevo.',
  limitReached: 'Este perfil ya guarda 500 medidas, el máximo. Quita alguna para anotar otra.',
  notFound: 'No encontramos esta medida.',
} as const

/** «9.0 kg» — one decimal as the mock, two when the parent wrote two (a datum is never rounded). */
export function kgText(kg: number): string {
  const two = Math.round(kg * 100) % 10 !== 0
  return `${kg.toFixed(two ? 2 : 1)} kg`
}

/** «82 cm» or «59.5 cm». */
export function cmText(cm: number): string {
  return `${Number.isInteger(cm) ? String(cm) : cm.toFixed(1)} cm`
}

export function valueText(indicator: Indicator, value: number): string {
  return indicator === 'weight' ? kgText(value) : cmText(value)
}

/** «11.4 kg · 82 cm», only the values written. */
export function valuesLine(weightKg: number | null, heightCm: number | null): string {
  return [weightKg != null ? kgText(weightKg) : null, heightCm != null ? cmText(heightCm) : null].filter(Boolean).join(' · ')
}

/** The child's detail summary (GrowthSection, not redesigned): «Última: 12.4 kg · 86 cm, 03 nov 2026». */
export function lastLine(m: { measuredOn: string; weightKg: number | null; heightCm: number | null }): string {
  return `Última: ${valuesLine(m.weightKg, m.heightCm)}, ${formatDateShort(m.measuredOn)}`
}

export function countLine(n: number): string {
  return n === 1 ? '1 medida' : `${n} medidas`
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** «hoy», «ayer», «hace 12 días», «hace 3 meses», «hace 1 año»: only how long ago, never whether that is long. */
export function sinceLine(today: string, on: string): string {
  const days = Math.max(0, Math.round(dayNumber(today) - dayNumber(on)))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days <= 30) return `hace ${days} días`
  const months = Math.floor(days / 30.4375)
  if (months < 12) return months <= 1 ? 'hace 1 mes' : `hace ${months} meses`
  const years = Math.floor(months / 12)
  return years === 1 ? 'hace 1 año' : `hace ${years} años`
}

/** «hace 12 días · 12 oct 2026». */
export function latestWhen(today: string, on: string): string {
  return `${sinceLine(today, on)} · ${formatDateShortNoPad(on)}`
}

/** «Anotada por Ana». */
export function byLine(name: string): string {
  return `Anotada por ${name}`
}

/** «Corregida el 3 oct 2026 por Luis». */
export function correctedLine(c: { at: string; by: { name: string } }): string {
  return `Corregida el ${formatDateShortNoPad(c.at.slice(0, 10))} por ${c.by.name}`
}

/** «Nota: Báscula de la farmacia». */
export function noteLine(note: string): string {
  return `Nota: ${note}`
}

/** The web's reading on one line: «12 oct 2026 · 11.4 kg · 2 años 1 mes». */
export function readingLine(date: string, indicator: Indicator, value: number, age: string): string {
  return `${formatDateShortNoPad(date)} · ${valueText(indicator, value)} · ${age}`
}

/** The phone's reading under the value: «12 oct 2026 · 2 años 1 mes». */
export function readingMeta(date: string, age: string): string {
  return `${formatDateShortNoPad(date)} · ${age}`
}
