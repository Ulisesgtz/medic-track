import type { Account } from '../home/types'
import type { PlanLimitReason } from '../account-signup/FreemiumLimitModal'

// Everything the plan screens say, in one place (specs/034): the price, what each plan includes and the comparison of each limit.
// It describes what the plans include and never what to do about a child's health (Principio I); no discounts, no monthly
// equivalent, no urgency.

/** The one price of the paid plan: MX$499 a year, one subscription for the whole family. */
export const PLAN_PRICE = 'MX$499'
export const PLAN_PERIOD = 'al año'

/**
 * Whether paying with a card exists. Until Mercado Pago is connected (BACKLOG) the button of the full plan is the design's
 * «Pronto» state; flipping this is part of that work, not a switch to try.
 */
export const PAYMENT_AVAILABLE = false

export const FREE_ITEMS = [
  '1 hijo.',
  'Una consulta con tratamiento activo a la vez (al terminar o finalizarlo, registras la siguiente).',
  'Registrar consultas con foto de la receta, medicamentos y horario, con lectura de la receta en tu teléfono.',
  'Síntomas por chips y notas.',
  'Marcar las tomas, con el calendario y la barra de progreso del tratamiento.',
  'Recordatorios push de las tomas del tratamiento activo.',
  'Todo lo que registres siempre lo puedes ver (nunca se oculta ni se borra).',
  'Si te invita una familia de pago, ves y marcas tomas.',
]

export const FULL_ITEMS = [
  'Hasta 10 hijos.',
  'Varias consultas con tratamiento activo a la vez.',
  'Consultas anteriores «solo registro» (sin horarios ni avisos).',
  'Historial con búsqueda y filtros (doctor, medicamento, síntomas, fechas).',
  'Compartir con tu familia: hasta 4 personas (Tutores y Cuidadores), cada una con sus avisos y «por Ana, 08:05» en cada toma marcada.',
  'Rutinas de suplementos de tus hijos y las tuyas, con tomas marcables y avisos (hasta 10 activas por hijo y 10 propias).',
  'Próxima cita con avisos editables (por omisión un día y dos horas antes) para toda la familia.',
  'Una suscripción por familia: quienes invitas quedan incluidos.',
]

/** Ideas without a date, shown apart and never as included. */
export const SOON_ITEMS = [
  'Exportar el historial a PDF para el pediatra.',
  'Liga de solo lectura para el pediatra.',
  'Curvas de crecimiento OMS.',
  'Cartilla de vacunas.',
  'Resumen semanal por correo.',
]

/** One row of the comparison: what the person has now and what the full plan adds. */
export interface ComparisonRow {
  label: string
  free: string
  full: string
}

export interface LimitMotive {
  title: string
  /** What was tried, in the design's words. */
  line: string
  /** Three rows; the FIRST is the one of the motive and is highlighted. */
  rows: [ComparisonRow, ComparisonRow, ComparisonRow]
}

const NO = 'No incluido'
const row = (label: string, free: string, full: string): ComparisonRow => ({ label, free, full })

export const LIMIT_MOTIVES: Record<PlanLimitReason, LimitMotive> = {
  children: {
    title: 'Tu plan incluye un hijo',
    line: 'Intentaste agregar a otro hijo. El plan gratuito incluye uno.',
    rows: [row('Hijos', '1', 'Hasta 10'), row('Familia', 'Solo tú', 'Hasta 4 personas'), row('Tratamientos activos', 'Uno a la vez', 'Varios a la vez')],
  },
  active_treatment: {
    title: 'Ya hay un tratamiento activo',
    line: 'Intentaste registrar una consulta con tratamiento mientras otro sigue activo. En el plan gratuito, al terminar o finalizar el actual registras el siguiente.',
    rows: [
      row('Tratamientos activos', 'Uno a la vez', 'Varios a la vez'),
      row('Consultas «solo registro»', NO, 'Sin horarios ni avisos'),
      row('Hijos', '1', 'Hasta 10'),
    ],
  },
  record_only: {
    title: 'Consultas «solo registro»',
    line: 'Intentaste guardar una consulta anterior sin horarios ni avisos. Esa opción es del plan completo.',
    rows: [
      row('Consultas anteriores «solo registro»', NO, 'Sin horarios ni avisos'),
      row('Historial', 'Se ve completo', 'Con búsqueda y filtros'),
      row('Tratamientos activos', 'Uno a la vez', 'Varios a la vez'),
    ],
  },
  history_search: {
    title: 'Búsqueda en el historial',
    line: 'Intentaste buscar o filtrar consultas. Tu historial se sigue viendo completo; la búsqueda y los filtros son del plan completo.',
    rows: [
      row('Historial', 'Se ve completo', 'Con búsqueda y filtros por doctor, medicamento, síntomas y fechas'),
      row('Consultas «solo registro»', NO, 'Sin horarios ni avisos'),
      row('Hijos', '1', 'Hasta 10'),
    ],
  },
  family: {
    title: 'Compartir con tu familia',
    line: 'Intentaste invitar a alguien. Con el plan completo, hasta 4 personas ven y marcan las tomas, cada una con sus avisos.',
    rows: [
      row('Personas en la familia', 'Solo tú', 'Hasta 4, Tutores y Cuidadores'),
      row('Quién marcó cada toma', NO, '«por Ana, 08:05»'),
      row('Suscripción', NO, 'Una para toda la familia'),
    ],
  },
  supplements: {
    title: 'Rutinas de suplemento',
    line: 'Intentaste crear una rutina de suplemento. Las rutinas, de tus hijos y las tuyas, son del plan completo.',
    rows: [
      row('Rutinas de suplemento', NO, 'Hasta 10 activas por hijo y 10 tuyas'),
      row('Avisos', 'Tomas del tratamiento activo', 'También de rutinas y citas'),
      row('Familia', 'Solo tú', 'Hasta 4 personas'),
    ],
  },
  appointments: {
    title: 'Próxima cita',
    line: 'Intentaste anotar la próxima cita. Las citas con avisos son del plan completo.',
    rows: [
      row('Próxima cita', NO, 'Con avisos editables'),
      row('Quién recibe el aviso', NO, 'Cada persona de la familia, si lo activa'),
      row('Familia', 'Solo tú', 'Hasta 4 personas'),
    ],
  },
}

/** Which plan the person is on, and — for a guest of a paid family — whose it is. */
export interface PlanStanding {
  plan: 'free' | 'full'
  /** The first name of the family's owner when the plan is theirs, not the person's own. */
  includedBy?: string
}

/**
 * The plan a person uses: their own account's if it is paid, otherwise the one of the family they belong to if THAT is paid
 * (they pay nothing), otherwise the free one — also for a guest whose family stopped paying. The server decides every action;
 * this only says what to show.
 */
export function planStanding(account: Pick<Account, 'plan' | 'family'> | undefined): PlanStanding {
  if (!account) return { plan: 'free' }
  if (account.plan === 'paid') return { plan: 'full' }
  if (account.family && account.family.plan === 'paid') return { plan: 'full', includedBy: account.family.ownerName.split(' ')[0] }
  return { plan: 'free' }
}
