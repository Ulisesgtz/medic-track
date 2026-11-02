// specs/056: the words of the page header shared by every secondary screen, so one test reads them all (Principio I: neutral,
// nothing that evaluates; an error never blames and always says that what was registered is kept).

export const PAGE_HEADER = {
  loading: 'Cargando',
  errorBody: 'Revisa tu conexión. Lo que ya registraste está guardado.',
  retry: 'Reintentar',
  readOnlyLead: 'Solo lectura.',
  readOnlyRest: 'La familia no tiene un plan activo. Puedes seguir marcando tomas y actividades.',
  onlyYou: 'Solo tú ves esto',
} as const

/** «No pudimos cargar la cartilla». */
export const loadFailedTitle = (what: string) => `No pudimos cargar ${what}`
