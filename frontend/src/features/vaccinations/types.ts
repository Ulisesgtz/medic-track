// Mirrors specs/046-cartilla-vacunacion/contracts/api.md.

/** One dose applied to a child, as the server returns it. `name` is the catalog's (even if the vaccine was retired) or the parent's own. */
export interface Vaccination {
  id: string
  vaccineCode: string | null
  name: string
  customName: string | null
  /** YYYY-MM-DD. */
  appliedOn: string
  doseNumber: number | null
  lot: string | null
  place: string | null
  notes: string | null
  createdByName: string
  createdAt: string
  correctedByName: string | null
  correctedAt: string | null
}

/** What the form sends to record or correct a dose. Exactly one of `vaccineCode` and `customName` has text. */
export interface VaccinationInput {
  vaccineCode: string
  customName: string
  appliedOn: string
  doseNumber: number | null
  lot: string
  place: string
  notes: string
  /** Confirms recording a dose that matches one already there. */
  allowDuplicate?: boolean
}

export interface VaccinationList {
  vaccinations: Vaccination[]
}

/** A photo of the paper card as the list shows it: never the image, which is asked for one at a time. */
export interface VaccinePhotoMeta {
  id: string
  createdAt: string
  createdByName: string
}

export interface VaccinePhotoList {
  photos: VaccinePhotoMeta[]
  limit: number
}

/** A vaccine with its doses, oldest first: only a way of showing what was recorded, never a count of what is missing. */
export interface VaccineGroup {
  key: string
  name: string
  doses: Vaccination[]
}
