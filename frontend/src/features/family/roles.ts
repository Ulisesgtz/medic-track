import { formatDateShort, formatTime } from '../../shared/date'
import type { MemberRole } from './types'

/** The words for a role: short label and what it can do. Neutral, never about the child's health (Principio I). */
export const ROLE_LABEL: Record<MemberRole, string> = {
  tutor: 'Tutor',
  caregiver: 'Cuidador',
  child: 'Hijo',
}

/** One line under a person in the list (mock «Familia»). */
export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  tutor: 'Ve todo, agrega consultas, marca tomas e invita.',
  caregiver: 'Ve todo y marca tomas.',
  child: 'Ve su propio tratamiento y marca sus tomas.',
}

export const OWNER_DESCRIPTION = 'Paga el plan y decide quién entra.'

/** What each role is when choosing it in the invitation form. */
export const ROLE_CHOICE: Record<'tutor' | 'caregiver', string> = {
  tutor: 'Ve todo, agrega consultas, marca tomas e invita. Nadie lo puede quitar; solo él puede salir.',
  caregiver: 'Ve todo y marca tomas. No agrega consultas ni invita. Tú o un tutor lo pueden quitar.',
}

/** What the invited person will and won't be able to do (the invitation page). */
export const ROLE_CAN: Record<MemberRole, string> = {
  tutor: 'ver consultas, medicamentos y tomas, marcar tomas, agregar consultas e invitar a otras personas.',
  caregiver: 'ver consultas, medicamentos y tomas, y marcar tomas.',
  child: 'ver tu propio tratamiento y marcar tus tomas.',
}

export const ROLE_CANNOT: Record<MemberRole, string | null> = {
  tutor: null,
  caregiver: 'agregar consultas ni invitar a otras personas.',
  child: 'agregar consultas ni invitar a otras personas.',
}

/** «Mateo», «Mateo y Sofía», «Mateo, Sofía y Luis»; «tus hijos» while there is nobody to name. */
export function namesText(names: string[], fallback = 'tus hijos'): string {
  if (names.length === 0) return fallback
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** «13 oct 2026, 18:40» in the person's own time zone. */
export function formatInstant(instant: string): string {
  const d = new Date(instant)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${formatDateShort(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)}, ${formatTime(d)}`
}
