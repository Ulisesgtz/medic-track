// specs/055 (research R4): every sentence of the home lives here, so one test (homeText.test.ts) can read them all. They count
// what was registered and never evaluate it: no «debes», «atrasado», «falta», percentages, praise or scolding (Principio I).

import { planStanding } from '../plans/planCopy'
import type { Account } from './types'

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const HOME = {
  menu: 'Menú de cuenta',
  dayTitle: 'Tu día',
  seeAll: 'Ver todo',
  myDoses: 'Mis tomas',
  myActivities: 'Mis actividades',
  allMarked: '✓ Todo marcado hasta ahora',
  nothingTodayMine: 'Hoy no tienes tomas ni actividades',
  addOwn: 'Agrega tus propios suplementos o actividades',
  planLine: 'tus suplementos y actividades',
  planBadge: 'Plan completo',
  done: '✓ Realizado',
  childrenTitle: 'Tus hijos',
  sharedTitle: 'Hijos compartidos contigo',
  medications: 'Medicamentos',
  supplements: 'Suplementos',
  activities: 'Actividades',
  unregisteredChip: 'sin registrar',
  nothingToday: 'Hoy no hay tomas ni actividades',
  next: 'Próxima',
  mark: 'Marcar',
  noChildrenTitle: 'Aún no registras a tus hijos',
  noChildrenBody: 'Agrega a un hijo para registrar sus consultas, medicamentos y actividades.',
  addChild: 'Agregar hijo',
  addChildMore: '+ Agregar hijo',
  planIncludesOne: 'Tu plan incluye un hijo',
  more: 'Más opciones',
  family: 'Familia',
  plans: 'Planes',
  reminders: 'Recordatorios',
  logout: 'Cerrar sesión',
  remindersOn: 'Activados',
  remindersOff: 'Desactivados',
  remindersUnavailable: 'No disponibles aquí',
  onlyYou: 'Solo tú',
  readOnlyLead: 'Solo lectura.',
  readOnlyRest: 'La familia no tiene un plan activo. Puedes seguir marcando tomas y actividades.',
  retry: 'Reintentar',
  markFailed: 'No se pudo marcar. Inténtalo de nuevo.',
  loadFailedMine: 'no pudimos cargar tus suplementos y actividades',
} as const

export const greeting = (name: string) => `Hola, ${name}`
/** «Familia de Ana»: the family the session was invited to (the API gives the owner's first name, not a surname). */
export const familyOf = (ownerName: string) => `Familia de ${ownerName}`
/** «Familia Morales · puedes ver y marcar». */
export const sharedSubtitle = (family: string) => `${family} · puedes ver y marcar`
/** «Próxima: Vitamina D · 14:00». */
export const nextLine = (name: string, time: string) => `${HOME.next}: ${name} · ${time}`
/** «Amoxicilina · 16:00» (the card's footer). */
export const nameAtTime = (name: string, time: string) => `${name} · ${time}`
export const doneLine = (name: string, time: string) => `✓ ${name} · ${time}`
export const markedAt = (time: string) => `✓ ${time}`

/** «2 de 4 hoy». */
export const dosesToday = (marked: number, total: number) => `${marked} de ${total} hoy`
/** «3 de 8 hechas». */
export const activitiesDone = (done: number, total: number) => `${done} de ${total} ${total === 1 ? 'hecha' : 'hechas'}`
/** «1 de 2». */
export const ofTotal = (marked: number, total: number) => `${marked} de ${total}`

/** «3 tomas hoy · 1 por marcar» / «· 1 sin registrar» / «· 2 marcadas». */
export function medicationsValue(m: { total: number; toMark: number; unregistered: number; marked: number }): string {
  const head = `${n(m.total, 'toma', 'tomas')} hoy`
  if (m.unregistered) return `${head} · ${m.unregistered} sin registrar`
  if (m.toMark) return `${head} · ${m.toMark} por marcar`
  return `${head} · ${n(m.marked, 'marcada', 'marcadas')}`
}

export const toMarkChip = (count: number) => `${count} por marcar`
/** «Paracetamol · 08:00 · sin registrar». */
export const unregisteredLine = (name: string, time: string) => `${name} · ${time} · ${HOME.unregisteredChip}`
/** The card's accessible name for «Marcar». */
export const markLabel = (name: string, time: string, child: string) => `${HOME.mark} ${name} ${time} de ${child}`
export const cardLabel = (child: string) => `Ver detalle de ${child}`
export const loadFailed = (child: string) => `No pudimos cargar el día de ${child}`
export const familyMembers = (count: number) => (count <= 1 ? HOME.onlyYou : n(count, 'persona', 'personas'))
/** «Familia Morales · Cuidador»: the role's own label (the design wrote «cuidadora»; the app doesn't guess anyone's gender). */
export const caregiverOf = (family: string, role: string) => `${family} · ${role}`
/** «Plan completo» / «Plan gratuito» (the plan the person uses: their own or the paid family's, `planStanding`). */
export const planLabel = (account: Pick<Account, 'plan' | 'family'>) => (planStanding(account).plan === 'full' ? 'Plan completo' : 'Plan gratuito')
