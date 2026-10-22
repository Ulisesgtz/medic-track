// Every sentence of the child's phone access lives here (specs/047), so one test can read them all. Nothing here says what to do about
// a child's health, what is late or missing, or alarms: it only says what the access is and does (Principio I). The parent is told
// plainly that giving a child a phone is their own decision (the app never asks or checks an age).

export const PARENT = {
  title: 'Acceso del hijo',
  intro: (child: string) => `Para que ${child} vea y marque sus tomas y actividades en su propio teléfono, sin cuenta ni contraseña.`,
  responsibility: (child: string) =>
    `Darle un teléfono a un niño es decisión tuya. Quien abra esta liga verá las tomas y actividades de ${child}. La puedes quitar cuando quieras.`,
  nameLabel: 'Nombre del teléfono',
  create: 'Crear liga',
  creating: 'Creando…',
  ready: {
    eyebrow: 'Liga lista',
    title: (child: string) => `Envíale esta liga al teléfono de ${child}`,
    expires: (date: string) => `Vence el ${date} y solo sirve una vez.`,
    linkLabel: 'Liga de acceso',
    onlyNow: 'Esta liga solo se muestra ahora. Si la pierdes, crea otra.',
    copy: 'Copiar liga',
    copied: 'Liga copiada ✓',
    copiedStatus: 'Liga copiada. Pégala en tu chat.',
    done: 'Listo',
  },
  errors: {
    name: 'El nombre debe tener de 1 a 40 caracteres.',
    limit: (n: number) => `Ya hay ${n} teléfonos o ligas sin usar para este hijo. Quita uno para crear otro.`,
    save: 'No se pudo crear la liga. Inténtalo de nuevo.',
    forbidden: 'Solo quien puede administrar a este hijo puede crear el acceso.',
  },
  list: {
    title: (child: string) => `Teléfonos de ${child}`,
    status: { pending: 'Sin abrir', active: 'Activo', expired: 'Vencido', revoked: 'Quitado' } as Record<string, string>,
    since: (date: string) => `Desde el ${date}`,
    created: (date: string) => `Creada el ${date}`,
    lastSeen: (when: string) => `Última vez: ${when}`,
    neverUsed: 'Sin usar todavía',
    reminderText: 'Texto del aviso',
    generic: 'Genérico',
    detailed: 'Con detalle',
    remove: 'Quitar',
    removeLabel: (name: string) => `Quitar ${name}`,
    loadError: 'No pudimos cargar los teléfonos.',
    saveError: 'No se pudo guardar. Inténtalo de nuevo.',
    onlyTutors: 'Un Tutor crea y quita los accesos.',
    confirm: {
      title: (name: string) => `¿Quitar «${name}»?`,
      rows: (child: string): { k: string; v: string }[] => [
        { k: 'Deja de ver', v: `Ese teléfono ya no verá las tomas ni las actividades de ${child}.` },
        { k: 'Se conserva', v: `Lo que ya marcó queda registrado con el nombre de ${child}.` },
        { k: 'Después', v: 'Puedes crear otra liga cuando quieras.' },
      ],
      confirm: 'Quitar',
      cancel: 'Cancelar',
      busy: 'Quitando…',
      error: 'No se pudo quitar. No se cambió nada. Inténtalo de nuevo.',
    },
  },
  plan: {
    title: 'Acceso del hijo',
    text: 'Con el plan completo, cada hijo puede ver y marcar sus tomas y actividades en su propio teléfono.',
  },
}

export const PHONE = {
  redeeming: 'Abriendo tu acceso…',
  redeemFailed: 'Esta liga ya no sirve. Pídele a tu papá o mamá una nueva.',
  noLink: 'Abre la liga que te mandaron para entrar.',
  noAccess: 'Este acceso ya no está activo. Pídele a tu papá o mamá uno nuevo.',
  install: 'Para que no se pierda, agrega esta app a la pantalla de inicio de tu teléfono.',
  greeting: (name: string) => (name ? `Hola, ${name}` : 'Hola'),
  today: 'Tus tomas de hoy',
  noDoses: 'Hoy no tienes tomas.',
  supplement: 'Suplemento',
  activities: 'Tus actividades',
  doneOf: (done: number, total: number) => `${done} de ${total} hechas hoy`,
  loading: 'Cargando tus tomas…',
  loadError: 'No pudimos cargar tus tomas.',
  retry: 'Reintentar',
}
