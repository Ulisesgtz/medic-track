const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export interface CatalogCountry {
  code: string
  name: string
}

export interface CatalogState {
  code: string
  name: string
}

/** A symptom a parent can mark on a consultation (specs/012): what they observed, never a diagnosis. */
export interface Symptom {
  code: string
  name: string
  category: string
}

/** The active symptoms, in catalog order (specs/012 contracts/symptoms-api.md §1). */
export async function fetchSymptoms(): Promise<Symptom[]> {
  const res = await fetch(`${API_BASE_URL}/catalog/symptoms`)
  if (!res.ok) {
    throw new Error(`Failed to fetch symptoms: ${res.status}`)
  }
  return res.json()
}

export async function fetchCountries(): Promise<CatalogCountry[]> {
  const res = await fetch(`${API_BASE_URL}/catalog/countries`)
  if (!res.ok) {
    throw new Error(`Failed to fetch countries: ${res.status}`)
  }
  return res.json()
}

export async function fetchStates(countryCode: string): Promise<CatalogState[]> {
  const res = await fetch(`${API_BASE_URL}/catalog/countries/${countryCode}/states`)
  if (res.status === 404) {
    return []
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch states: ${res.status}`)
  }
  return res.json()
}
