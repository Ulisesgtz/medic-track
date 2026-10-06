// Mirrors specs/032-compartir-con-familia/contracts/family.md.
import type { FamilyRole } from '../home/types'

/** Roles an invitation can offer in this delivery; the child role comes later. */
export type InviteRole = 'tutor' | 'caregiver'
export type MemberRole = 'tutor' | 'caregiver' | 'child'

export interface FamilyMember {
  id: string
  name: string
  role: MemberRole
  childId: string | null
  /** ISO instant the person joined. */
  since: string
  /** The session can remove this person (it can do everything, and the person is not a Tutor). */
  canRemove: boolean
  /** This person is the session's own account. */
  you: boolean
}

export interface FamilyInvitation {
  id: string
  email: string
  role: MemberRole
  status: 'pending' | 'expired'
  /** ISO instant the invitation stops working. */
  expiresAt: string
  childId: string | null
}

export interface FamilyView {
  role: FamilyRole
  plan: string
  readOnly: boolean
  owner: { id: string; name: string }
  members: FamilyMember[]
  /** Only what the session can manage: empty for a Caregiver. */
  invitations: FamilyInvitation[]
  capacity: { max: number; used: number }
}

/** What creating or resending an invitation answers: the only time the token is returned. */
export interface CreatedInvitation {
  id: string
  email: string
  role: MemberRole
  status: string
  expiresAt: string
  token: string
}

export interface InvitationPreview {
  ownerName: string
  role: MemberRole
  childFirstName?: string
  /** Whom the invitation asks the person to look after (first names only). */
  childrenFirstNames: string[]
  email: string
  expiresAt: string
  /** The session's verified e-mail is the invited one (only that account can accept). */
  emailMatches: boolean
}

export interface Membership {
  id: string
  role: MemberRole
  name: string
}
