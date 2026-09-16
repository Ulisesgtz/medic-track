import { useQuery } from '@tanstack/react-query'
import { fetchCountries, fetchStates } from './api'

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
