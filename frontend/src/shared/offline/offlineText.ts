import { formatTime } from '../date'

// The words of the app without a connection (specs/067, contracts/ui.md). They talk about the connection and the hour of the data
// — never about the health, never «error» (Principio I) — and they are the owner's to approve.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** «Sin conexión · datos de las 08:15», or «… datos del 10 nov, 21:40» when the data aren't from today. */
export function bannerText(updatedAt: number, now: Date = new Date()): string {
  const at = new Date(updatedAt)
  if (sameLocalDay(at, now)) return `Sin conexión · datos de las ${formatTime(at)}`
  return `Sin conexión · datos del ${at.getDate()} ${MONTHS[at.getMonth()]}, ${formatTime(at)}`
}

export const BANNER_LABEL = 'Estado de la conexión'

export const GATE_TITLE = 'Necesitas conexión para abrir PediTrack'
export const GATE_BODY_PHONE = 'Cuando tengas señal, abre la app y lo que veas quedará disponible en este teléfono por 7 días.'
export const GATE_BODY_COMPUTER = 'Cuando tengas conexión, vuelve a abrir esta página.'
export const RETRY = 'Reintentar'

export const MARK_NEEDS_CONNECTION = 'Marcar necesita conexión. Tu marca no se guardó.'
export const ACTION_NEEDS_CONNECTION = 'Esto necesita conexión. Lo que escribiste sigue aquí.'

export const SCREEN_NEEDS_CONNECTION = 'Esta pantalla necesita conexión.'
export const BACK = '← Volver'

export const PHOTO_NEEDS_CONNECTION = 'La foto necesita conexión.'
