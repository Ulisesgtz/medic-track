// specs/062-botiquin: the family's medicine cabinet, as the API answers it (contracts/api.md).

export type CabinetUnit = 'box' | 'tablet' | 'bottle' | 'ml'

export const CABINET_UNITS: CabinetUnit[] = ['box', 'tablet', 'bottle', 'ml']

/** The expiry date as the parent typed it: month and year, the day only if they wrote it. Only a datum (Principio I). */
export interface Expires {
  year: number
  month: number
  day: number | null
}

export interface CabinetItem {
  id: string
  name: string
  strength: string
  quantity: number
  unit: CabinetUnit
  expires: Expires
  note: string
  hasPhoto: boolean
  createdBy: string
  createdAt: string
  updatedBy: string | null
  updatedAt: string | null
  canEdit: boolean
}

export interface CabinetList {
  items: CabinetItem[]
  canEdit: boolean
  canAdd: boolean
  limit: number
}

export interface CabinetInput {
  name: string
  strength: string
  quantity: number
  unit: CabinetUnit
  expires: Expires
  note: string
  /** Creating: absent = no photo. Editing: absent = unchanged, "" = removed. */
  photoBase64?: string
}

/** What «Agregar al botiquín» of a consultation brings, in the router's state (never in the address: Principio II). */
export interface FromConsultation {
  consultationId: string
  name: string
  consultDate: string
  doctor: string
}
