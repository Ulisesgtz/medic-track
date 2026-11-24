// Las 15 preguntas frecuentes (5 temas), con el texto del diseño. Un solo origen para /preguntas-frecuentes, las 6 del inicio y el
// JSON-LD FAQPage: cambiar una respuesta cambia las tres (specs/080, R3). Las respuestas son texto plano.
//
// «{app}» en una respuesta es la dirección de la app (app.pedi-track.com): las instrucciones de instalación abren la app, no el sitio.
// Se resuelve con `faqText` al dibujar (la vista previa apunta a la app de DEV).

export const FAQ_TOPICS = ['Sobre PediTrack', 'Planes y pagos', 'Instalación y uso', 'Familia', 'Tus datos'] as const
export type FaqTopic = (typeof FAQ_TOPICS)[number]

export interface FaqItem {
  id: string
  topic: FaqTopic
  question: string
  answer: string
  /** Sale en el inicio (6 de las 15). */
  home: boolean
}

export const FAQ: FaqItem[] = [
  {
    id: 'que-es',
    topic: 'Sobre PediTrack',
    question: '¿Qué es PediTrack?',
    answer:
      'Es una bitácora médica de la familia: una app web que guarda las consultas del pediatra, la receta, los medicamentos con su horario, la cartilla de vacunación y el crecimiento de cada hijo, y te avisa cuándo toca cada toma.',
    home: true,
  },
  {
    id: 'sustituye-al-pediatra',
    topic: 'Sobre PediTrack',
    question: '¿PediTrack sustituye al pediatra o da consejos médicos?',
    answer:
      'No. PediTrack registra y te recuerda; no diagnostica, no da consejos médicos, no calcula percentiles ni dice si algo está «bien» o «mal». No sustituye la consulta ni el criterio de tu médico.',
    home: true,
  },
  {
    id: 'como-se-leen-las-recetas',
    topic: 'Sobre PediTrack',
    question: '¿Cómo se leen las recetas?',
    answer:
      'Tomas una foto de la receta y el texto se lee en tu teléfono. PediTrack propone los medicamentos y tú los revisas y corriges antes de guardarlos.',
    home: false,
  },
  {
    id: 'es-gratis',
    topic: 'Planes y pagos',
    question: '¿PediTrack es gratis?',
    answer:
      'Hay un plan gratis (MX$0) para 1 hijo, con consultas con receta, recordatorios, un tratamiento activo a la vez, cartilla de vacunación, ficha y medidas de crecimiento. El Plan completo cuesta MX$499 al año para toda la familia.',
    home: true,
  },
  {
    id: 'cuantos-hijos',
    topic: 'Planes y pagos',
    question: '¿Cuántos hijos puedo registrar?',
    answer: 'El plan gratis permite 1 hijo; el Plan completo permite hasta 10 hijos con una sola suscripción.',
    home: false,
  },
  {
    id: 'como-pago',
    topic: 'Planes y pagos',
    question: '¿Cómo pago el Plan completo?',
    answer: 'El pago se hace con Mercado Pago: MX$499 al año, una suscripción para toda la familia.',
    home: false,
  },
  {
    id: 'dejo-de-pagar',
    topic: 'Planes y pagos',
    question: '¿Qué pasa si dejo de pagar el Plan completo?',
    answer: 'Lo registrado nunca se borra. Tu cuenta vuelve al plan gratis y conservas lo que ya anotaste.',
    home: true,
  },
  {
    id: 'instalar-iphone',
    topic: 'Instalación y uso',
    question: '¿Cómo instalo PediTrack en iPhone?',
    answer:
      'Abre {app} en Safari, toca el botón Compartir y elige «Agregar a pantalla de inicio». No necesitas tienda de aplicaciones. Los pasos con imágenes están en la página Instalar la app.',
    home: true,
  },
  {
    id: 'instalar-android',
    topic: 'Instalación y uso',
    question: '¿Cómo instalo PediTrack en Android?',
    answer:
      'Abre {app} en Chrome, toca el menú de tres puntos y elige «Instalar app» o «Agregar a pantalla de inicio». Los pasos con imágenes están en la página Instalar la app.',
    home: false,
  },
  {
    id: 'sin-internet',
    topic: 'Instalación y uso',
    question: '¿Funciona sin internet?',
    answer:
      'Se instala como app y, sin conexión, se ve lo último que viste. Sin internet no se actualiza lo nuevo, así que abre la app con conexión de vez en cuando.',
    home: false,
  },
  {
    id: 'compartir-con-pareja',
    topic: 'Familia',
    question: '¿Cómo comparto la información con mi pareja?',
    answer:
      'Con el Plan completo puedes invitar hasta 4 personas como Tutores o Cuidadores (por ejemplo, abuelos o niñera). Cada quien puede marcar las tomas y recibe sus propios avisos.',
    home: false,
  },
  {
    id: 'mi-hijo-ve-sus-tomas',
    topic: 'Familia',
    question: '¿Mi hijo puede ver sus tomas?',
    answer: 'Con el Plan completo, el teléfono del hijo da acceso sin cuenta para que vea y marque sus tomas de hoy.',
    home: false,
  },
  {
    id: 'venden-datos',
    topic: 'Tus datos',
    question: '¿Venden mis datos o muestran anuncios?',
    answer:
      'No. PediTrack no tiene anuncios ni vende datos. La lectura del texto de la receta se hace en tu propio teléfono y la foto de la receta no sale de tu cuenta.',
    home: true,
  },
  {
    id: 'descargar-datos',
    topic: 'Tus datos',
    question: '¿Cómo descargo todos mis datos?',
    answer:
      'Entra a «Mi cuenta» (en «Lo demás», dentro de la app) y toca «Descargar mis datos»: recibes un archivo con todo lo que registraste, cuando quieras y con cualquier plan. También puedes exportar el historial de un hijo a PDF para llevarlo al médico (Plan completo).',
    home: false,
  },
  {
    id: 'eliminar-cuenta',
    topic: 'Tus datos',
    question: '¿Cómo elimino mi cuenta?',
    answer:
      'Entra a «Mi cuenta» y toca «Eliminar mi cuenta». Tu cuenta queda en pausa 30 días por si cambias de opinión y después se borra por completo. Si prefieres conservar tu información, descárgala antes.',
    home: false,
  },
]

/** El orden de las 6 del inicio es el del diseño, no el de la página de preguntas. */
const HOME_ORDER = ['que-es', 'es-gratis', 'sustituye-al-pediatra', 'venden-datos', 'instalar-iphone', 'dejo-de-pagar']

function rank(id: string): number {
  const at = HOME_ORDER.indexOf(id)
  return at === -1 ? HOME_ORDER.length : at
}

export function homeFaq(items: FaqItem[] = FAQ): FaqItem[] {
  return items.filter((item) => item.home).sort((a, b) => rank(a.id) - rank(b.id))
}

/** La dirección de la app sin `https://` (p. ej. `app.pedi-track.com`), para las instrucciones de instalación. */
export function appHost(appOrigin: string): string {
  try {
    return new URL(appOrigin).host
  } catch {
    return appOrigin.replace(/^https?:\/\//, '')
  }
}

/** El texto de una respuesta con la dirección de la app en su lugar. */
export function faqText(answer: string, host: string): string {
  return answer.replaceAll('{app}', host)
}

/** Los temas con sus preguntas, en el orden de la página de preguntas frecuentes. */
export function faqByTopic(items: FaqItem[] = FAQ): Array<{ topic: FaqTopic; items: FaqItem[] }> {
  return FAQ_TOPICS.map((topic) => ({ topic, items: items.filter((item) => item.topic === topic) })).filter((group) => group.items.length > 0)
}

/** El id de un tema para su ancla: «Instalación y uso» es `instalacion-y-uso`. */
export function topicId(topic: string): string {
  return topic
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
