const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export interface CatalogCountry {
  code: string
  name: string
}

export interface CatalogState {
  code: string
  name: string
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
