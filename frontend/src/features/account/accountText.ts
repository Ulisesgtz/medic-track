// specs/070 (contracts/ui.md): every sentence of «Mi cuenta», deleting the account and the paused account. Neutral, never
// frightening, nothing about anybody's health. `accountText.test.ts` reads them all.

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** «12 de diciembre de 2026», in the device's own time zone (the date the account will be deleted). */
export function longDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

export const ACCOUNT = {
  title: 'Mi cuenta',
  back: '← Inicio',
  needsConnection: 'Esta pantalla necesita conexión.',
  planFull: 'Plan completo',
  planFree: 'Gratis',
  familyOf: (owner: string) => `Familia de ${owner}`,

  downloadTitle: 'Descargar todos mis datos',
  downloadBody:
    'Un archivo con todo lo que registraste: tus hijos, consultas, recetas, tomas, vacunas, medidas, botiquín, suplementos y actividades, con sus fotos. Se abre en tu computadora sin PediTrack.',
  downloadButton: 'Descargar mis datos',
  downloading: 'Preparando tu archivo…',
  downloaded: 'Listo: tu archivo se descargó.',
  downloadFailed: 'No se pudo descargar. Vuelve a intentarlo.',
  share: 'Compartir',
  save: 'Descargar',

  deleteTitle: 'Eliminar mi cuenta',
  deleteBody: 'Borra tu cuenta y todo lo que registraste, también lo de tus hijos.',
  deleteLink: 'Eliminar mi cuenta…',
} as const

export const DELETE = {
  title: 'Eliminar mi cuenta',
  back: '← Mi cuenta',
  whatTitle: 'Qué se borra',
  what: 'Tu cuenta, tus hijos y todo lo que registraste de ellos: consultas, fotos de recetas, tomas, citas, vacunas, medidas, suplementos, actividades y botiquín. También tus consultas y rutinas personales.',
  whenTitle: 'Cuándo',
  when: (date: string) =>
    `Se borrará el ${date}, en 30 días. Hasta entonces puedes descargar tus datos y cancelar. Después no se puede recuperar.`,
  meanwhileTitle: 'Mientras tanto',
  meanwhile: 'Ya no podrás registrar ni marcar nada, y dejarás de recibir avisos.',
  familyTitle: 'Tu familia',
  familyOwner:
    'Si compartes tus hijos con tu familia, cada persona recibirá un aviso. Hasta esa fecha seguirán viéndolos y marcando sus tomas, y podrán descargar sus datos; después dejarán de verlos.',
  familyMember: (owner: string) =>
    `Saldrás de la familia de ${owner}. Tus marcas en las tomas se quedan, sin tu nombre.`,
  subscriptionTitle: 'Tu suscripción',
  subscription:
    'Si tienes una suscripción vigente, se cancela ahora y no habrá más cobros. Los pagos ya hechos no se reembolsan desde la app.',
  downloadFirst: 'Descargar mis datos primero',
  confirmLabel: 'Escribe ELIMINAR para confirmar',
  cancel: 'Cancelar',
  submit: 'Eliminar mi cuenta',
  submitting: 'Eliminando…',
  failedSubscription:
    'No pudimos cancelar tu suscripción. Intenta en unos minutos; no se hizo ningún cambio.',
  failed: 'No se pudo pedir la eliminación. Intenta de nuevo.',
} as const

export const PAUSED = {
  dismiss: 'Cerrar',
  title: (date: string) => `Tu cuenta se borrará el ${date}`,
  body: 'Hasta entonces puedes descargar tus datos o cancelar la eliminación. No puedes registrar ni marcar nada.',
  cancel: 'Cancelar la eliminación',
  canceling: 'Cancelando…',
  canceled: 'Listo, tu cuenta sigue igual.',
  subscriptionNote:
    'Si tenías una suscripción, quedó cancelada; puedes contratarla de nuevo en Planes.',
  cancelFailed: 'No se pudo cancelar. Intenta de nuevo.',
  signOut: 'Cerrar sesión',
} as const

export const FAMILY_NOTICE = {
  body: (owner: string, children: string, date: string) =>
    `${owner} pidió eliminar su cuenta. ${children} ${children.includes(' y ') ? 'dejarán' : 'dejará'} de aparecer el ${date}. Hasta entonces puedes verlos, marcar tomas y descargar sus datos.`,
  download: 'Descargar sus datos',
} as const

/** «Mateo», «Mateo y Sofía», «Mateo, Sofía y Pablo». */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'Sus hijos'
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}
