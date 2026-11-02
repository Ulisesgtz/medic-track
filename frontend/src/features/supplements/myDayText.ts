// specs/056 (research R8, R9): the sentences of «Mi día», the person's own page, in one place so one test (myDayText.test.ts) reads
// them all. They say what the app does and count what was registered; never a suggestion about a supplement (Principio I).

export const MY_DAY = {
  title: 'Mi día',
  onlyYou: 'Solo tú ves esto',
  back: '← Mi día',
  firstText: 'Aquí verás tus tomas y actividades del día, con las horas que tú escribas.',
  firstSupplement: 'Agregar mi primer suplemento',
  firstActivity: 'Agregar una actividad',
  howTitle: 'Cómo funcionan',
  howText:
    'Escribes el nombre, la cantidad y las horas. A esas horas te llega un aviso y aquí marcas lo que tomaste o hiciste. PediTrack no sugiere suplementos ni opina sobre ellos.',
  understood: 'Entendido',
  saveFailed: 'No se pudo guardar. Inténtalo de nuevo.',
  mySupplements: 'Mis suplementos',
  myActivities: 'Mis actividades',
  emptySupplements: 'Sin suplementos',
  emptyActivities: 'Sin actividades',
  planTitle: 'Suplementos y actividades',
  planText: 'Registrar los tuyos es parte del plan completo. Lo que ya creaste se sigue viendo y marcando.',
} as const

/** The initials of the account's avatar («AM»). */
export const initials = (firstName: string, lastName: string) => `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
