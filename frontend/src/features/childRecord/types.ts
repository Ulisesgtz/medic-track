// specs/073: the child's record (la «ficha»), as the API of contracts/api.md sends it. Everything is what the family wrote, shown as
// written (Principio I): the app never compares it with anything.

export type BloodType = 'O+' | 'O-' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'unknown'
export type AllergyKind = 'medication' | 'food' | 'other'

export interface RecordAllergy {
  name: string
  kind: AllergyKind | null
  note: string | null
}

export interface RecordCondition {
  name: string
  note: string | null
}

export interface RecordPediatrician {
  name: string | null
  phone: string | null
  office: string | null
}

export interface ChildRecord {
  exists: boolean
  /** 0 = there is no record yet; the number the next save must send back as `expectedVersion`. */
  version: number
  canEdit: boolean
  bloodType: BloodType | null
  generalNote: string | null
  pediatrician: RecordPediatrician | null
  allergies: RecordAllergy[]
  conditions: RecordCondition[]
  /** «Actualizada el … por Ana»: the first name of whoever saved it. */
  updated: { at: string; by: string | null } | null
}

/** What a save sends: the whole record and the version it was edited from. */
export interface ChildRecordInput {
  expectedVersion: number
  bloodType: BloodType | null
  generalNote: string | null
  pediatrician: RecordPediatrician | null
  allergies: RecordAllergy[]
  conditions: RecordCondition[]
}

export const BLOOD_TYPES: readonly BloodType[] = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'unknown']
export const ALLERGY_KINDS: readonly AllergyKind[] = ['medication', 'food', 'other']

/** The limits of the contract (the server checks them again). */
export const LIMITS = {
  items: 30,
  name: 120,
  note: 300,
  generalNote: 1000,
  pediatricianName: 120,
  phone: 30,
  office: 300,
} as const
