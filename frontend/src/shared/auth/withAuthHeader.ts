/**
 * Builds the Authorization header for a request to PediTrack's own backend,
 * from a Clerk session token (`useAuth().getToken()`). Every `api.ts` that
 * calls a protected endpoint uses this instead of building the header
 * inline, so the shape can't drift between features.
 */
export function withAuthHeader(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
