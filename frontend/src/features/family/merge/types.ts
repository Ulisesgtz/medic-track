// Shapes of specs/074-unir-hijo-duplicado/contracts/api.md.
export interface MergeRecordSummary {
  exists: boolean
  bloodType?: string | null
  pediatrician?: { name: string | null; phone: string | null; office: string | null } | null
  generalNote?: string | null
  allergies: number
  conditions: number
}

export interface MergeCounts {
  consultations: number
  vaccines: number
  cardPhotos: number
  measurements: number
  supplements: number
  activities: number
  activeDevices: number
}

export interface MergeChild {
  id: string
  hidden?: boolean
  firstName: string
  lastName: string
  birthDate: string
  height: number | null
  weight: number | null
  growthReferenceSex: string | null
  record: MergeRecordSummary
  counts: MergeCounts
}

export interface SuggestedPair {
  ownChildId: string
  familyChildId: string
  reason: 'same_name'
}

export interface MergeOptions {
  canMerge: boolean
  familyOwnerFirstName: string
  ownChildren: MergeChild[]
  familyChildren: MergeChild[]
  suggestedPairs: SuggestedPair[]
}

export interface PairIds {
  ownChildId: string
  familyChildId: string
}

export type DifferenceField =
  | 'firstName'
  | 'lastName'
  | 'birthDate'
  | 'height'
  | 'weight'
  | 'growthReferenceSex'
  | 'bloodType'
  | 'pediatrician'
  | 'generalNote'

export type Side = 'own' | 'family'
export type Choices = Partial<Record<DifferenceField, Side>>

export interface MergePairPreview extends PairIds {
  differences: DifferenceField[]
  moves: {
    consultations: number
    vaccines: number
    cardPhotos: number
    measurements: number
    supplements: number
    activities: number
    record: boolean
    devicesRemoved: number
  }
  overLimits: { kind: string; resulting: number; limit: number }[]
  recordTooLong: { list: string; resulting: number; limit: number } | null
}

export interface MergePairRequest extends PairIds {
  choices: Choices
}

export type MergePairError =
  | 'merge_not_allowed'
  | 'not_found'
  | 'record_too_long'
  | 'birth_date_conflict'
  | 'choices_missing'
  | 'internal_error'

export interface MergePairResult extends PairIds {
  status: 'merged' | 'failed'
  moves?: MergePairPreview['moves']
  error?: MergePairError
  /** Which field or list the error names (never a value). */
  field?: string
  list?: string
  resulting?: number
  limit?: number
}
