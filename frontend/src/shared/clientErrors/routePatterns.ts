import { matchPath } from 'react-router-dom'

// specs/072, research R6: the screen an error happened on, as its route pattern (`/consultations/:consultationId`), never the real
// address (it carries ids). `routePatterns.test.ts` reads App.tsx and fails if this list and the routes drift apart: a new screen is
// listed here too.
export const ROUTE_PATTERNS: readonly string[] = [
  '/signup',
  '/registro/completar',
  '/sso-callback',
  '/login',
  '/recuperar-contrasena',
  '/home',
  '/children/:childId',
  '/botiquin',
  '/botiquin/nuevo',
  '/botiquin/:itemId',
  '/botiquin/:itemId/editar',
  '/children/:childId/editar',
  '/children/:childId/crecimiento',
  '/children/:childId/crecimiento/nueva',
  '/children/:childId/crecimiento/:measurementId/editar',
  '/children/:childId/cartilla',
  '/children/:childId/ficha/editar',
  '/children/:childId/historial',
  '/children/:childId/consultations/new',
  '/consultations/:consultationId',
  '/consultations/:consultationId/editar',
  '/children/:childId/suplementos/nueva',
  '/children/:childId/actividades/nueva',
  '/yo',
  '/yo/consultas/nueva',
  '/yo/historial',
  '/personas/:accountId',
  '/personas/:accountId/historial',
  '/mi-dia',
  '/mis-suplementos',
  '/mis-actividades',
  '/mis-suplementos/nueva',
  '/mis-actividades/nueva',
  '/suplementos/:routineId',
  '/actividades/:routineId',
  '/suplementos/:routineId/editar',
  '/actividades/:routineId/editar',
  '/citas/:appointmentId/editar',
  '/consultations/:consultationId/cita/nueva',
  '/children/:childId/citas/nueva',
  '/children/:childId/citas',
  '/familia',
  '/familia/invitacion',
  '/hijo',
  '/hijo/hoy',
  '/',
  '/planes',
  '/cuenta',
  '/cuenta/eliminar',
  '/planes/regreso',
  '/planes/pago-de-prueba',
  '/__prueba-error',
  '/__prueba-error/pagina',
  '/hijo/__prueba-error',
]

export const OTHER_ROUTE = 'other'

/** The pattern of an address, or `other` when it is none of the app's screens. When two fit, the one with fewer parameters wins. */
export function routePattern(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  let best: string | null = null
  for (const pattern of ROUTE_PATTERNS) {
    if (!matchPath({ path: pattern, end: true }, path)) continue
    if (best === null || pattern.split(':').length < best.split(':').length) best = pattern
  }
  return best ?? OTHER_ROUTE
}
