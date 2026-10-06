// Mirrors contracts/get-account.md's response shape — same body as
// POST /accounts' 201 (specs/001-registro-cuenta-usuario).
export interface Child {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  height: number | null
  weight: number | null
  // Specs/032: the account the child belongs to (the family's owner), the session's role over it ("owner" for its own
  // children), the plan of that family and whether the session can only see and mark (read-only: the family stopped
  // paying). Optional so the screens and tests written before families keep compiling: absent = own child.
  accountId?: string
  role?: FamilyRole
  plan?: string
  readOnly?: boolean
}

export type FamilyRole = 'owner' | 'tutor' | 'caregiver' | 'child'

// The place of the session in somebody else's family; only present when it has one.
export interface FamilyMembership {
  role: Exclude<FamilyRole, 'owner'>
  ownerAccountId: string
  ownerName: string
  plan: string
  readOnly: boolean
}

export interface Account {
  id: string
  firstName: string
  lastName: string
  email: string
  countryCode: string | null
  stateCode: string | null
  plan: string
  children: Child[]
  // The version of the "Antes de empezar" notice to show, and whether this account already acknowledged it
  // (specs/010-registro-aceptacion-aviso).
  disclaimerVersion: string
  disclaimerAccepted: boolean
  // What dose reminders show; null until the tutor chooses on the first activation (specs/011).
  reminderDetail: 'detailed' | 'generic' | null
  family?: FamilyMembership
}
