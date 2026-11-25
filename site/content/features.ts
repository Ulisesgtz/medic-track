// Las funciones de PediTrack por grupo, con el texto de «Sitio publico - Paginas» (artboard «Fu»). Cada función es una tarjeta con su
// ancla (`/funciones#vacunacion`): el inicio y las preguntas enlazan a ellas, así que un `id` no se renombra sin buscar los enlaces.

export type PlanLabel = 'Plan gratis' | 'Plan completo' | 'Gráfica: Plan completo'

export interface Feature {
  id: string
  plan: PlanLabel
  title: string
  text: string
}

export interface FeatureGroup {
  id: string
  title: string
  features: Feature[]
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'grupo-consultas',
    title: 'Consultas y medicamentos',
    features: [
      { id: 'consultas', plan: 'Plan gratis', title: 'Registrar consultas', text: 'Doctor, fecha, síntomas (con chips) y notas de cada consulta, en un solo registro.' },
      {
        id: 'receta',
        plan: 'Plan gratis',
        title: 'Foto de la receta',
        text: 'La foto se guarda en tu cuenta. El texto se lee en tu teléfono y propone los medicamentos para que los revises.',
      },
      {
        id: 'horario',
        plan: 'Plan gratis',
        title: 'Horario y control de tomas',
        text: 'Con frecuencia, duración y primera toma, la app arma el horario. Marca cada toma con un toque («por Ana, 08:05») y mira el calendario y el avance.',
      },
      {
        id: 'recordatorios',
        plan: 'Plan gratis',
        title: 'Recordatorios de medicamentos para niños',
        text: 'Avisos en el teléfono y en la computadora a la hora de cada toma, aunque la app esté cerrada.',
      },
      {
        id: 'tratamientos',
        plan: 'Plan gratis',
        title: 'Finalizar o extender un tratamiento',
        text: 'Cierra un tratamiento o extiéndelo, y edita una consulta cuando algo cambia.',
      },
      {
        id: 'consultas-anteriores',
        plan: 'Plan completo',
        title: 'Consultas anteriores',
        text: 'Guarda consultas pasadas «solo como registro», sin generar tomas.',
      },
      { id: 'proxima-cita', plan: 'Plan completo', title: 'Próxima cita', text: 'Doctor, lugar y «Abrir en Maps», con avisos antes de la cita.' },
    ],
  },
  {
    id: 'grupo-hijo',
    title: 'Cada hijo',
    features: [
      {
        id: 'vacunacion',
        plan: 'Plan gratis',
        title: 'Cartilla de vacunación digital',
        text: 'Anótala a mano o leyendo la foto de la cartilla, y guarda fotos de la cartilla de papel.',
      },
      {
        id: 'crecimiento',
        plan: 'Gráfica: Plan completo',
        title: 'Crecimiento',
        text: 'Medidas de peso y talla con su historial. La gráfica muestra las curvas de la OMS como referencia; tu pediatra es quien la interpreta.',
      },
      { id: 'ficha', plan: 'Plan gratis', title: 'Ficha del hijo', text: 'Alergias, tipo de sangre, padecimientos y pediatra con «Llamar».' },
      {
        id: 'suplementos-actividades',
        plan: 'Plan completo',
        title: 'Suplementos y actividades',
        text: 'Suplementos y actividades por tipo (escolar, deportiva, artística, terapia, hábitos) con «Realizado».',
      },
      {
        id: 'historial',
        plan: 'Plan completo',
        title: 'Historial médico de tus hijos y PDF',
        text: 'Historial con búsqueda y filtros, y exportación a PDF para llevar al médico.',
      },
    ],
  },
  {
    id: 'grupo-familia',
    title: 'Toda la familia',
    features: [
      {
        id: 'familia',
        plan: 'Plan completo',
        title: 'Compartir con la familia',
        text: 'Hasta 4 personas como Tutores o Cuidadores (abuelos, niñera). Cada quien marca y recibe sus avisos.',
      },
      { id: 'telefono-del-hijo', plan: 'Plan completo', title: 'El teléfono del hijo', text: 'Acceso sin cuenta para que tu hijo vea y marque sus tomas de hoy.' },
      { id: 'botiquin', plan: 'Plan completo', title: 'Botiquín de la casa', text: 'Las medicinas que hay en casa, con caducidad y foto de la caja.' },
      { id: 'tus-consultas', plan: 'Plan completo', title: 'Tus propias consultas', text: 'Las consultas de mamá o papá, privadas o compartidas.' },
    ],
  },
  {
    id: 'grupo-siempre',
    title: 'Siempre contigo',
    features: [
      {
        id: 'instalable',
        plan: 'Plan gratis',
        title: 'Instalable y sin conexión',
        text: 'Se instala en el teléfono como app, sin tiendas. Se ve lo último que viste, aun sin conexión.',
      },
      {
        id: 'tus-datos',
        plan: 'Plan gratis',
        title: 'Privacidad y tus datos',
        text: 'Sin anuncios, sin venta de datos; descarga todos tus datos o elimina tu cuenta cuando quieras.',
      },
    ],
  },
]
