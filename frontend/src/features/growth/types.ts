// specs/063: the growth record's shapes, as the API answers them (contracts/api.md).

export type ReferenceSex = 'female' | 'male'

export interface Measurement {
  id: string
  measuredOn: string // YYYY-MM-DD
  weightKg: number | null
  heightCm: number | null
  note: string | null
  createdBy: { name: string }
  createdAt: string
  corrected: { at: string; by: { name: string } } | null
}

export interface GrowthList {
  measurements: Measurement[]
  /** The weight and height written when the child was added, without a date: shown apart, never drawn. */
  registered: { weightKg: number | null; heightCm: number | null } | null
  referenceSex: ReferenceSex | null
  birthDate: string
  canEdit: boolean
  chartAvailable: boolean
}

export interface MeasurementInput {
  measuredOn: string
  weightKg: number | null
  heightCm: number | null
  note: string
}

export interface ChartPoint {
  measuredOn: string
  months: number
  value: number
}

/** One month of a WHO reference: the published percentiles only (never the child's own). */
export interface CurvePoint {
  months: number
  p3: number
  p15: number
  p50: number
  p85: number
  p97: number
}

export interface Curve {
  maxMonths: number
  curves: CurvePoint[]
}

export interface GrowthChart {
  birthDate: string
  referenceSex: ReferenceSex | null
  points: { weight: ChartPoint[]; height: ChartPoint[] }
  reference: { available: boolean; source: string; weight: Curve; height: Curve } | null
}

export type Indicator = 'weight' | 'height'
