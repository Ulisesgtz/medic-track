import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { fetchFamily } from './api'
import { anySending } from './emailStatus'

/** The session's family (`GET /family`, specs/032-compartir-con-familia): its people and, to who can manage it, its invitations. */
export function useFamily() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  return useQuery({
    queryKey: ['family'],
    queryFn: async () => fetchFamily(await getToken()),
    enabled: isLoaded && isSignedIn === true,
    retry: false,
    // While an invitation's e-mail is going out, ask again every few seconds so «enviándose» becomes «enviada» by itself; it
    // stops on its own when none is sending.
    refetchInterval: (query) => (anySending(query.state.data?.invitations) ? 3000 : false),
  })
}
