import type { RoutineKind } from './types'

// The words of the «Suplementos» and «Actividades» sections, in a child's detail and in the person's own pages (specs/035, mock
// RegistroSeccion). Everything the screens say about one kind lives here, so the two sections can't drift apart.
// The UI says «suplemento» and «actividad», never «rutina» (the code and the API keep `routine`).

export interface SectionCopy {
  /** The child's section title and the person's own page title. */
  title: string
  personalTitle: string
  /** «+ Agregar suplemento». */
  add: string
  /** «Activos» / «Activas» and «Pausados y terminados» / «Pausadas y terminadas». */
  activeList: string
  inactiveList: string
  /** «3 activos» / «1 activa». */
  count: (n: number) => string
  /** The cap block: «Ya tienes 10 suplementos activos». */
  capTitle: (limit: number) => string
  capText: (who: string | null) => string
  capLink: string
  emptyChildTitle: (name: string) => string
  emptyChildText: string
  emptyChildViewerText: string
  viewerNote: string
  planTitle: string
  planText: (name: string) => string
  personalEmptyTitle: string
  personalEmptyText: string
  personalPlanTitle: string
  personalPlanText: string
  privacy: string
  lapsedText: string
  usesFamilyPlan: string
  howItWorks: string
  /** The sentence of the first-time notice that says the app doesn't suggest any. */
  noSuggest: string
  loadFailed: string
  personalLoadFailed: string
  /** The address of the registration form and of the active list's anchor. */
  newPath: (childId: string | null) => string
  anchor: string
}

export const SECTION_COPY: Record<RoutineKind, SectionCopy> = {
  supplement: {
    title: 'Suplementos',
    personalTitle: 'Mis suplementos',
    add: '+ Agregar suplemento',
    activeList: 'Activos',
    inactiveList: 'Pausados y terminados',
    count: (n) => `${n} ${n === 1 ? 'activo' : 'activos'}`,
    capTitle: (limit) => `Ya tienes ${limit} suplementos activos`,
    capText: (who) => `Es el máximo${who ? ` para ${who}` : ''}. Para agregar otro, pausa o finaliza uno de los de abajo; los pausados no cuentan.`,
    capLink: 'Ir a los suplementos activos',
    emptyChildTitle: (name) => `${name} aún no tiene suplementos`,
    emptyChildText: 'Para lo que {name} toma a horas fijas. Cada toma aparece en «Tomas de hoy» para marcarla, y cada persona de la familia puede recibir sus avisos.',
    emptyChildViewerText: 'Un Tutor puede registrar lo que toma a horas fijas. Cada toma aparece en «Tomas de hoy» para marcarla.',
    viewerNote: 'Los suplementos los agrega y edita un Tutor. Tú puedes marcar las tomas y elegir tus avisos.',
    planTitle: 'Suplementos',
    planText: (name) => `Lo que ${name} toma a horas fijas, con cada toma para marcar y avisos para la familia.`,
    personalEmptyTitle: 'Aún no tienes suplementos',
    personalEmptyText: 'Para lo que tomas a horas fijas. Cada toma aparece en el inicio para marcarla y, si lo activas, te llega un aviso.',
    personalPlanTitle: 'Tus suplementos',
    personalPlanText: 'Lo que tomas a horas fijas, con cada toma para marcar y avisos solo para ti.',
    privacy: 'Solo tú ves estos suplementos y solo a ti te llegan los avisos.',
    lapsedText: 'Los suplementos siguen aquí y sus tomas se pueden marcar. Para agregar, editar o reanudar uno se necesita el plan completo.',
    usesFamilyPlan: 'Los usas con el plan completo de la familia a la que te invitaron. Nadie de esa familia los ve.',
    howItWorks: 'Cómo funcionan los suplementos',
    noSuggest: 'No sugiere suplementos ni opina sobre ellos.',
    loadFailed: 'No se pudieron cargar los suplementos.',
    personalLoadFailed: 'No se pudieron cargar tus suplementos.',
    newPath: (childId) => (childId ? `/children/${childId}/suplementos/nueva` : '/mis-suplementos/nueva'),
    anchor: 'suplementos-activos',
  },
  activity: {
    title: 'Actividades',
    personalTitle: 'Mis actividades',
    add: '+ Agregar actividad',
    activeList: 'Activas',
    inactiveList: 'Pausadas y terminadas',
    count: (n) => `${n} ${n === 1 ? 'activa' : 'activas'}`,
    capTitle: (limit) => `Ya tienes ${limit} actividades activas`,
    capText: (who) => `Es el máximo${who ? ` para ${who}` : ''}. Para agregar otra, pausa o finaliza una de las de abajo; las pausadas no cuentan.`,
    capLink: 'Ir a las actividades activas',
    emptyChildTitle: (name) => `${name} aún no tiene actividades`,
    emptyChildText:
      'Para lo que {name} hace varias veces al día, desde una hora hasta otra. Cada vez se marca con «Realizado», y cada persona de la familia puede recibir sus avisos.',
    emptyChildViewerText: 'Un Tutor puede registrar lo que hace varias veces al día. Cada vez se marca con «Realizado».',
    viewerNote: 'Las actividades las agrega y edita un Tutor. Tú puedes marcar «Realizado» y elegir tus avisos.',
    planTitle: 'Actividades',
    planText: (name) => `Lo que ${name} hace varias veces al día, desde una hora hasta otra, marcado con «Realizado» y con avisos para la familia.`,
    personalEmptyTitle: 'Aún no tienes actividades',
    personalEmptyText: 'Para lo que haces varias veces al día, desde una hora hasta otra. Cada vez se marca con «Realizado» y, si lo activas, te llega un aviso.',
    personalPlanTitle: 'Tus actividades',
    personalPlanText: 'Lo que haces varias veces al día, desde una hora hasta otra, marcado con «Realizado» y con avisos solo para ti.',
    privacy: 'Solo tú ves estas actividades y solo a ti te llegan los avisos.',
    lapsedText: 'Las actividades siguen aquí y se pueden marcar con «Realizado». Para agregar, editar o reanudar una se necesita el plan completo.',
    usesFamilyPlan: 'Las usas con el plan completo de la familia a la que te invitaron. Nadie de esa familia las ve.',
    howItWorks: 'Cómo funcionan las actividades',
    noSuggest: 'No sugiere actividades ni opina sobre ellas.',
    loadFailed: 'No se pudieron cargar las actividades.',
    personalLoadFailed: 'No se pudieron cargar tus actividades.',
    newPath: (childId) => (childId ? `/children/${childId}/actividades/nueva` : '/mis-actividades/nueva'),
    anchor: 'actividades-activas',
  },
}

/** The empty text of a child's section with the child's name (the table keeps `{name}` so the sentence reads as a whole). */
export const emptyChildText = (kind: RoutineKind, name: string) => SECTION_COPY[kind].emptyChildText.replace('{name}', name)
