import { Navigate, useLocation } from 'react-router-dom'

/** `/mi-dia` (specs/056) is the profile now (specs/058): it goes to `/yo`, keeping the section it pointed at (`#suplementos`). */
export function ProfileRedirect() {
  const { hash } = useLocation()
  return <Navigate to={{ pathname: '/yo', hash }} replace />
}
