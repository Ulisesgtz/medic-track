import { ROLE_LABEL } from './roles'
import type { MemberRole } from './types'

const base = 'rounded-full text-xs font-extrabold tracking-[0.08em] uppercase'

/** The role of a person or an invitation as a chip: the family account in `ink`, a Tutor in `action`, a Caregiver in `hint` with an outline. */
export function RoleChip({ role }: { role: MemberRole | 'owner' }) {
  if (role === 'owner') return <span className={`${base} bg-ink px-2.5 py-1 text-white`}>Cuenta de la familia</span>
  if (role === 'tutor') return <span className={`${base} bg-action px-2.5 py-1 text-white`}>{ROLE_LABEL.tutor}</span>
  return <span className={`${base} border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-action`}>{ROLE_LABEL[role]}</span>
}
