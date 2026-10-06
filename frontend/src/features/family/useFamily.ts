import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { fetchFamily } from './api'

/** The session's family (`GET /family`, specs/032-compartir-con-familia): its people and, to who can manage it, its invitations. */
export function useFamily() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  return useQuery({
    queryKey: ['family'],
    queryFn: async () => fetchFamily(await getToken()),
    enabled: isLoaded && isSignedIn === true,
    retry: false,
  })
}
