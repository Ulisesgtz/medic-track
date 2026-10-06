import type { MemberRole } from './types'

/** The words for a role: short label and what it can do. Neutral, never about the child's health (Principio I). */
export const ROLE_LABEL: Record<MemberRole, string> = {
  tutor: 'Tutor',
  caregiver: 'Cuidador',
  child: 'Hijo',
}

export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  tutor: 'Ve los mismos hijos y consultas que tú, agrega consultas, marca tomas e invita.',
  caregiver: 'Ve las consultas y marca tomas. No agrega ni invita.',
  child: 'Ve su propio tratamiento y marca sus tomas.',
}
