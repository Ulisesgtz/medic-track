// Los dos planes, tal cual el diseño (specs/080). Una prueba (src/sync.test.ts) los compara con frontend/src/features/plans/planCopy.ts:
// si cambia el precio en la app y no aquí, falla.

export interface Plan {
  name: string
  price: string
  period: string
  includes: string[]
}

export const FREE_PLAN: Plan = {
  name: 'Gratis',
  price: 'MX$0',
  period: 'para siempre',
  includes: [
    '1 hijo',
    'Consultas con receta y recordatorios',
    'Un tratamiento activo a la vez',
    'Cartilla de vacunación y ficha',
    'Medidas de crecimiento',
  ],
}

export const FULL_PLAN: Plan = {
  name: 'Plan completo',
  price: 'MX$499',
  period: 'al año · una suscripción para toda la familia',
  includes: [
    'Hasta 10 hijos y tratamientos sin límite',
    'Consultas anteriores e historial con búsqueda',
    'Exportar a PDF, suplementos y actividades',
    'Próxima cita, gráfica de crecimiento y botiquín',
    'Familia compartida, teléfono del hijo y tus propias consultas',
    'Pago con Mercado Pago',
  ],
}

export const PLANS = [FREE_PLAN, FULL_PLAN]

/** Las tarjetas de /planes: el precio y una línea de lo que trae cada plan (el diseño «Pl»). */
export const PLAN_CARDS = [
  {
    plan: FREE_PLAN,
    period: 'para siempre',
    summary: 'Para empezar con 1 hijo: consultas con receta, recordatorios, un tratamiento activo, cartilla, ficha y medidas.',
  },
  {
    plan: FULL_PLAN,
    period: 'al año, para toda la familia',
    summary: 'Hasta 10 hijos, tratamientos sin límite y todas las funciones. Pago con Mercado Pago.',
  },
] as const

export type PlanCellValue = 'included' | 'excluded' | string

export interface PlanTableRow {
  feature: string
  free: PlanCellValue
  full: PlanCellValue
}

/** «Qué incluye cada plan», fila por fila como el diseño. «Incluido» y «No incluido» llevan icono y texto. */
export const PLAN_TABLE_ROWS: PlanTableRow[] = [
  { feature: 'Hijos registrados', free: '1', full: 'Hasta 10' },
  { feature: 'Consultas con receta', free: 'included', full: 'included' },
  { feature: 'Recordatorios de tomas', free: 'included', full: 'included' },
  { feature: 'Tratamientos activos', free: 'Uno a la vez', full: 'Sin límite' },
  { feature: 'Cartilla de vacunación', free: 'included', full: 'included' },
  { feature: 'Ficha del hijo', free: 'included', full: 'included' },
  { feature: 'Medidas de crecimiento', free: 'included', full: 'included' },
  { feature: 'Gráfica de crecimiento', free: 'excluded', full: 'included' },
  { feature: 'Consultas anteriores', free: 'excluded', full: 'included' },
  { feature: 'Historial con búsqueda', free: 'excluded', full: 'included' },
  { feature: 'Exportar a PDF', free: 'excluded', full: 'included' },
  { feature: 'Suplementos y actividades', free: 'excluded', full: 'included' },
  { feature: 'Próxima cita con avisos', free: 'excluded', full: 'included' },
  { feature: 'Compartir con la familia (hasta 4)', free: 'excluded', full: 'included' },
  { feature: 'Teléfono del hijo', free: 'excluded', full: 'included' },
  { feature: 'Botiquín de la casa', free: 'excluded', full: 'included' },
  { feature: 'Tus propias consultas', free: 'excluded', full: 'included' },
]

/** La última fila de la tabla. */
export const PLAN_TABLE_PRICE = { label: 'Precio', free: 'MX$0', full: 'MX$499 al año' }

/** Las tres preguntas del cobro que /planes repite (ids de `content/faq.ts`, en el orden del diseño). */
export const PLAN_FAQ_IDS = ['como-pago', 'dejo-de-pagar', 'cuantos-hijos']
