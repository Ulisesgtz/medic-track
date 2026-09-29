import { useQuery } from '@tanstack/react-query'
import { fetchCountries, fetchStates, fetchSymptoms } from './api'

/** Key of the symptoms catalog; invalidated when the server says a chosen symptom was retired. */
export const SYMPTOMS_QUERY_KEY = ['catalog', 'symptoms'] as const

/**
 * The symptoms offered in "Nueva consulta" (specs/012). Maintained on the server, so a symptom added or
 * retired there shows up on the next load, without a new release of the app.
 */
export function useSymptoms() {
  return useQuery({
    queryKey: SYMPTOMS_QUERY_KEY,
    queryFn: fetchSymptoms,
    staleTime: 10 * 60 * 1000,
  })
}

/** Fetches the list of countries for the country selector. */
export function useCountries() {
  return useQuery({
    queryKey: ['catalog', 'countries'],
    queryFn: fetchCountries,
    staleTime: Infinity,
  })
}

/**
 * Fetches the states for the given country code. Disabled until a country is
 * selected. An empty array is a valid result (country with no subdivisions
 * in the catalog), not an error.
 */
export function useStates(countryCode: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'states', countryCode],
    queryFn: () => fetchStates(countryCode as string),
    enabled: Boolean(countryCode),
    staleTime: Infinity,
  })
}
