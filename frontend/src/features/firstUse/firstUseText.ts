// specs/071-primer-uso-guiado: every sentence of the first-use guide, copied from the delivered design
// (`referencia/Primer uso guiado PediTrack.dc.html`), so one test (firstUseText.test.ts) can read them all. The guide never
// speaks of plans, limits or prices (FR-025) and never advises on health (FR-026, Principio I).

export const FIRST_USE = {
  title: 'Primeros pasos',
  dismiss: 'Ahora no',
  optional: 'Opcional',
  done: 'Hecho',
  blockedLabel: 'Bloqueado hasta el paso 2',
  seeConsultation: 'Ver consulta',

  // Step 1: the first consultation.
  consultationTitle: 'Registra tu primera consulta',
  consultationPhone: 'Tomar foto de la receta',
  consultationWeb: 'Nueva consulta',
  consultationDescPhone:
    'Toma una foto de la receta y PediTrack te ayuda a llenar los medicamentos. La lectura se hace en tu dispositivo; tú revisas y confirmas todo.',
  consultationDescWeb:
    'Sube una foto de la receta y PediTrack te ayuda a llenar los medicamentos. La lectura se hace en tu dispositivo; tú revisas y confirmas todo.',
  chooseChild: '¿De quién es la consulta?',
  chooseChildCancel: 'Cancelar',

  // Step 2: install.
  installTitlePhone: 'Instala PediTrack en tu pantalla de inicio',
  installTitleWeb: 'Instala PediTrack en tu computadora',
  installDonePhone: 'PediTrack está en tu pantalla de inicio.',
  installDoneWeb: 'PediTrack está instalada en esta computadora.',
  installDescPhone: 'Ábrela con un toque, como cualquier app.',
  installDescWeb: 'Se abre en su propia ventana, sin pestañas. Puedes dejarlo para después o no hacerlo.',
  installButton: 'Instalar',
  installIosIntro: 'En iPhone se hace desde Safari, en tres pasos:',
  installIosNote: 'Cuando abras PediTrack desde el ícono nuevo, este paso se marcará solo.',
  installOpenInSafari: 'Abre PediTrack en Safari para instalarla.',
  installOpenInSafariNote: 'En iPhone solo Safari puede poner PediTrack en la pantalla de inicio.',
  installMenuIntro: 'En Android se hace desde el menú del navegador, en dos pasos:',
  installMenu: [
    'Abre el menú del navegador, con los tres puntos de arriba a la derecha.',
    'Elige «Instalar app» o «Agregar a pantalla de inicio».',
  ],

  // Step 3: reminders.
  remindersTitle: 'Activa los recordatorios',
  remindersDonePhone: 'Los avisos están activos en este dispositivo.',
  remindersDoneWeb: 'Los avisos están activos en este navegador.',
  remindersDesc: 'Un aviso a la hora de cada toma, aunque la app esté cerrada.',
  remindersButton: 'Activar recordatorios',
  remindersHint: 'Tu navegador te pedirá permiso.',
  remindersBlocked:
    'En iPhone, los avisos solo funcionan con PediTrack en la pantalla de inicio. Primero haz el paso 2 y luego vuelve aquí.',
  remindersGoToStep2: 'Ir al paso 2',
  remindersDenied:
    'Los avisos están desactivados en este navegador. Para activarlos de nuevo, cambia el permiso en los ajustes del sitio:',
  remindersAlreadyOn: 'Ya los activé',
  remindersSkipNote: 'Si prefieres no recibirlos, la app funciona igual.',

  // The aviso al cerrar and the row that opens the guide again.
  closedNotice: 'Cerraste la guía. Puedes volver a abrirla en',
  closedNoticeLink: 'Primeros pasos',
  closedNoticeEnd: ', al final del inicio.',
  reopenRow: 'Primeros pasos',
  reopenValue: 'Ver guía',
} as const

/** The three steps of the permission settings on a phone. */
export const DENIED_PHONE = [
  'Toca el ícono junto a la dirección del sitio.',
  'Abre «Permisos» y luego «Notificaciones».',
  'Elige «Permitir» y regresa a PediTrack.',
] as const

/** The three steps of the permission settings on a computer. */
export const DENIED_WEB = [
  'Haz clic en el candado junto a la dirección.',
  'Abre «Configuración del sitio».',
  'En «Notificaciones» elige «Permitir» y recarga la página.',
] as const

/** The three steps of Safari's «Compartir» on an iPhone. */
export const SAFARI_STEPS = [
  'Toca Compartir, en la barra de abajo de Safari.',
  'Desliza y toca «Agregar a pantalla de inicio».',
  'Toca «Agregar», arriba a la derecha.',
] as const

export const SAFARI_ART_LABEL = 'Barra inferior de Safari con el botón Compartir resaltado'

/** «Tres pasos, en el orden que quieras.» — «Dos pasos…», «Un paso…». */
export function stepsSubtitle(count: number): string {
  const word = count >= 3 ? 'Tres pasos' : count === 2 ? 'Dos pasos' : 'Un paso'
  return `${word}, en el orden que quieras.`
}

/** The farewell once every shown step is done: «Los tres pasos están hechos. Esta guía ya no se mostrará.» */
export function farewell(count: number): string {
  const lead = count >= 3 ? 'Los tres pasos están hechos' : count === 2 ? 'Los dos pasos están hechos' : 'El paso está hecho'
  return `${lead}. Esta guía ya no se mostrará.`
}

/** The text of «Registraste la consulta con la Dra. López.» keeps the doctor exactly as it was saved. */
export function consultationDone(doctorName: string): string {
  return `Registraste la consulta con ${doctorName}.`
}
