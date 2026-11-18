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
  // Specs/064: the last correction of the child's data (when, and the first name of who); null if never corrected.
  correctedAt?: string | null
  correctedBy?: string | null
  // Specs/074: the times this child absorbed another record of a family member (when, and the first name of who merged).
  merges?: { at: string; byFirstName: string | null }[]
}

export type FamilyRole = 'owner' | 'tutor' | 'caregiver' | 'child'

// The place of the session in somebody else's family; only present when it has one.
export interface FamilyMembership {
  role: Exclude<FamilyRole, 'owner'>
  ownerAccountId: string
  ownerName: string
  plan: string
  readOnly: boolean
  // Specs/070: set when the family's owner asked to delete her account. Until that date the person sees and marks her children
  // and can download their data; then they stop seeing them.
  deletionScheduledFor?: string | null
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
  // Specs/058: whether the person shares their own consultations with the Tutors of their family, and the people who share
  // theirs with this one. Optional: a backend that predates it doesn't send them.
  consultationSharing?: { shared: boolean; changedAt: string | null }
  sharedProfiles?: SharedProfile[]
  // Specs/070: set when the account asked to delete itself; the app then only offers downloading the data and canceling.
  deletion?: { scheduledFor: string } | null
  // Specs/071: the first-use guide of the home. Optional: a backend that predates it doesn't send it.
  firstUseGuide?: FirstUseGuideState
  // Specs/074: the children the person hid while using the family's records (they are not in `children`).
  hiddenChildren?: { id: string; firstName: string }[]
}

/** What the server knows for the first-use guide: whether the account closed it and its oldest consultation (specs/071). */
export interface FirstUseGuideState {
  dismissed: boolean
  // null when the account has no consultation; childId is null for the person's own consultation (specs/058).
  firstConsultation: { id: string; doctorName: string; childId: string | null } | null
}

/** Somebody of the family who shares their own consultations with the session (specs/058). */
export interface SharedProfile {
  accountId: string
  firstName: string
}
