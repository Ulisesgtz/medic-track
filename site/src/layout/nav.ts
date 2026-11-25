/** Los cinco enlaces del menú (el mismo en la barra web y en el panel del teléfono). */
export interface NavItem {
  label: string
  href: string
  /** La ruta de la página que lo marca como actual; «Familia» es una sección del inicio y no marca ninguna. */
  path?: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Funciones', href: '/funciones', path: '/funciones' },
  { label: 'Planes', href: '/planes', path: '/planes' },
  { label: 'Familia', href: '/#familia' },
  { label: 'Privacidad', href: '/privacidad', path: '/privacidad' },
  { label: 'Preguntas', href: '/preguntas-frecuentes', path: '/preguntas-frecuentes' },
]

/** Los destinos de la app desde el sitio (contracts/rutas.md). */
export const APP_PATHS = { signup: '/signup', login: '/login', plans: '/planes' } as const
