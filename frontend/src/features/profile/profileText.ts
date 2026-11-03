// specs/058 (research R8): the sentences of the person's own profile — their consultations, the switch to share them and somebody
// else's shared profile — in one place, so one test (profileText.test.ts) reads them all. They say what the app does and who sees
// what; never an opinion about a consultation or a dose (Principio I).

export const PROFILE = {
  onlyYou: 'Solo tú ves esto',
  sharedWithTutors: 'Tus consultas las ven los Tutores de tu familia',
  back: '← Mi perfil',
  newConsultation: 'Nueva consulta',
  noConsultationsText: 'Registra aquí tus propias consultas: la receta, tus medicamentos y sus horarios. Los avisos te llegan a ti.',
  planTitle: 'Tus consultas',
  planText: 'Registrar tus propias consultas es parte del plan completo. Lo que ya registraste se sigue viendo y marcando.',
  shareTitle: 'Compartir mis consultas con los Tutores de mi familia',
  shareOn: 'La persona dueña de la familia y los Tutores ven tus consultas y pueden marcar tus tomas. No pueden cambiarlas. Los Cuidadores nunca las ven.',
  shareOff: 'Solo tú ves tus consultas. Tus suplementos y actividades siguen siendo solo tuyos.',
  shareLabel: 'Compartir mis consultas con los Tutores de mi familia',
  shareNoFamily: 'Para compartirlas necesitas una familia con alguien más.',
  sharePlan: 'Compartirlas es parte del plan completo de la familia.',
  shareFailed: 'No se pudo guardar. Inténtalo de nuevo.',
  sharedSubtitle: 'Te compartió sus consultas',
  sharedGone: 'Ya no puedes ver estas consultas.',
  sharedGoneText: 'Quien las compartió dejó de compartirlas, o ya no están en la misma familia.',
  backHome: '← Inicio',
  remindersTitle: 'Tus avisos',
  remindersText: 'A la hora de cada toma de esta consulta, en tus dispositivos.',
  remindersNote: 'Solo te llegan a ti mientras te compartan estas consultas.',
  remindersLabel: 'Tus avisos de esta consulta',
  remindersFailed: 'No se pudo guardar tu elección. Inténtalo de nuevo.',
  loadFailed: 'tus datos',
  sidebar: 'Mi perfil',
  loadFailedDay: 'No pudimos cargar sus tomas de hoy.',
  sharedTitle: 'Compartido contigo',
} as const

/** «← Ana»: back to somebody's shared profile. */
export const backTo = (firstName: string) => `← ${firstName}`

/** The entry of somebody's shared profile in the home and the sidebar: «Consultas de Ana». */
export const sharedEntry = (firstName: string) => `Consultas de ${firstName}`
