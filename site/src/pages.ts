import type { ComponentType } from 'react'
import { Faq } from './pages/Faq.tsx'
import { Features } from './pages/Features.tsx'
import { Home } from './pages/Home.tsx'
import { Install } from './pages/Install.tsx'
import { PrivacyNotice, PrivacyAndSecurity, Terms } from './pages/Legal.tsx'
import { NotFound } from './pages/NotFound.tsx'
import { Plans } from './pages/Plans.tsx'
import type { ArticleMeta } from './seo.tsx'

export type SchemaType =
  | 'Organization'
  | 'WebSite'
  | 'SoftwareApplication'
  | 'FAQPage'
  | 'BreadcrumbList'
  | 'WebPage'
  | 'CollectionPage'
  | 'Article'

export interface Crumb {
  name: string
  path: string
}

/**
 * Una página del sitio (specs/080, data-model.md). El title, la descripción, el H1 y el schema son los de la tabla de SEO de
 * «Sitio publico - Decisiones y SEO» (referencia/), copiados textualmente.
 */
export interface Page {
  /** Empieza con `/`, en minúsculas y sin barra final (salvo `/`). La 404 es `/404`. */
  path: string
  /** Hasta 60 caracteres. */
  title: string
  /** Hasta 155 caracteres. */
  description: string
  /** Exactamente uno por página. */
  h1: string
  schema: SchemaType[]
  /** `false` solo en la 404 (y, en la vista previa, todas llevan noindex además). */
  index: boolean
  /** `/og/<nombre>.png`, 1200×630. */
  ogImage: string
  /** Vacía en `/` y en la 404. */
  breadcrumbs: Crumb[]
  /**
   * La página React que se convierte en HTML. Las páginas que aún no se construyen (fases 4 a 8 de tasks.md) no la tienen: ni se
   * escriben ni entran al sitemap.
   */
  component?: ComponentType
  /** Solo los artículos del blog: sus fechas, para el JSON-LD `Article`. */
  article?: ArticleMeta
}

const HOME_CRUMB: Crumb = { name: 'Inicio', path: '/' }
const crumbs = (name: string, path: string): Crumb[] => [HOME_CRUMB, { name, path }]

export const PAGES: Page[] = [
  {
    path: '/',
    title: 'PediTrack: app para registrar los medicamentos de tus hijos',
    description:
      'Bitácora médica de la familia: guarda consultas, recetas, horario de tomas, cartilla de vacunación y crecimiento de tus hijos. Gratis para 1 hijo.',
    h1: 'App para registrar los medicamentos y el historial médico de tus hijos',
    schema: ['Organization', 'WebSite', 'SoftwareApplication'],
    index: true,
    ogImage: '/og/inicio.png',
    breadcrumbs: [],
    component: Home,
  },
  {
    path: '/funciones',
    title: 'Funciones de PediTrack: recetas, tomas, vacunas, crecimiento',
    description:
      'Registra consultas y recetas, arma el horario de tomas, anota la cartilla de vacunación y las medidas de crecimiento de cada hijo. Conoce las funciones.',
    h1: 'Funciones de PediTrack: consultas, medicamentos, vacunas y crecimiento',
    schema: ['BreadcrumbList'],
    index: true,
    ogImage: '/og/funciones.png',
    breadcrumbs: crumbs('Funciones', '/funciones'),
    component: Features,
  },
  {
    path: '/planes',
    title: 'Planes y precios de PediTrack: gratis o MX$499 al año',
    description:
      'Empieza gratis con 1 hijo o elige el Plan completo por MX$499 al año para toda la familia: hasta 10 hijos y pago con Mercado Pago.',
    h1: 'Planes y precios: gratis o Plan completo de MX$499 al año',
    schema: ['BreadcrumbList', 'SoftwareApplication'],
    index: true,
    ogImage: '/og/planes.png',
    breadcrumbs: crumbs('Planes', '/planes'),
    component: Plans,
  },
  {
    path: '/privacidad',
    title: 'Privacidad y seguridad en PediTrack: tus datos son tuyos',
    description:
      'Sin anuncios ni venta de datos, la receta se lee en tu teléfono y puedes descargar todos tus datos o eliminar tu cuenta cuando quieras.',
    h1: 'Privacidad y seguridad en PediTrack, explicadas en simple',
    schema: ['BreadcrumbList', 'WebPage'],
    index: true,
    ogImage: '/og/privacidad.png',
    breadcrumbs: crumbs('Privacidad y seguridad', '/privacidad'),
    component: PrivacyAndSecurity,
  },
  {
    path: '/preguntas-frecuentes',
    title: 'Preguntas frecuentes de PediTrack: planes, instalar, datos',
    description:
      'Dudas sobre qué es PediTrack, si es gratis, cómo instalarla en iPhone y Android, cómo compartir con la familia y cómo descargar tus datos.',
    h1: 'Preguntas frecuentes sobre PediTrack',
    schema: ['FAQPage', 'BreadcrumbList'],
    index: true,
    ogImage: '/og/preguntas-frecuentes.png',
    breadcrumbs: crumbs('Preguntas frecuentes', '/preguntas-frecuentes'),
    component: Faq,
  },
  {
    path: '/blog',
    title: 'Blog y guías de PediTrack: organiza recetas y tomas',
    description:
      'Guías de organización para mamás y papás: recetas, tomas del antibiótico y qué llevar a la consulta. Sin consejos médicos.',
    h1: 'Guías para organizar las recetas, tomas y consultas de tus hijos',
    schema: ['CollectionPage', 'BreadcrumbList'],
    index: true,
    ogImage: '/og/blog.png',
    breadcrumbs: crumbs('Blog y guías', '/blog'),
  },
  {
    path: '/blog/organizar-recetas-hijos',
    title: 'Cómo organizar las recetas de tus hijos | PediTrack',
    description:
      'Un método simple para guardar cada receta, su fecha y sus medicamentos por hijo, y llegar a la siguiente consulta con todo a la mano.',
    h1: 'Cómo organizar las recetas de tus hijos',
    schema: ['Article', 'BreadcrumbList'],
    index: true,
    ogImage: '/og/blog-organizar-recetas.png',
    breadcrumbs: [HOME_CRUMB, { name: 'Blog y guías', path: '/blog' }, { name: 'Cómo organizar las recetas de tus hijos', path: '/blog/organizar-recetas-hijos' }],
  },
  {
    path: '/blog/no-olvidar-tomas-antibiotico',
    title: 'Cómo no olvidar las tomas del antibiótico | PediTrack',
    description:
      'Ideas de organización para seguir el horario que indicó el médico: horario de tomas, avisos y quién marca cada toma. No es consejo médico.',
    h1: 'Cómo no olvidar las tomas del antibiótico',
    schema: ['Article', 'BreadcrumbList'],
    index: true,
    ogImage: '/og/blog-tomas-antibiotico.png',
    breadcrumbs: [HOME_CRUMB, { name: 'Blog y guías', path: '/blog' }, { name: 'Cómo no olvidar las tomas del antibiótico', path: '/blog/no-olvidar-tomas-antibiotico' }],
  },
  {
    path: '/blog/que-llevar-consulta-pediatra',
    title: 'Qué llevar a la consulta del pediatra | PediTrack',
    description:
      'Una lista para llegar con la información a la mano: receta anterior, cartilla de vacunación, medidas y tus notas. Guía de organización.',
    h1: 'Qué llevar a la consulta del pediatra',
    schema: ['Article', 'BreadcrumbList'],
    index: true,
    ogImage: '/og/blog-que-llevar.png',
    breadcrumbs: [HOME_CRUMB, { name: 'Blog y guías', path: '/blog' }, { name: 'Qué llevar a la consulta del pediatra', path: '/blog/que-llevar-consulta-pediatra' }],
  },
  {
    path: '/instalar',
    title: 'Instalar PediTrack en iPhone y Android, paso a paso',
    description: 'Instala PediTrack como app desde el navegador, sin tiendas: pasos para iPhone con Safari y Android con Chrome.',
    h1: 'Instalar PediTrack en tu teléfono, paso a paso',
    schema: ['BreadcrumbList'],
    index: true,
    ogImage: '/og/instalar.png',
    breadcrumbs: crumbs('Instalar la app', '/instalar'),
    component: Install,
  },
  {
    path: '/aviso-de-privacidad',
    title: 'Aviso de privacidad | PediTrack',
    description: 'Aviso de privacidad de PediTrack: qué datos se recopilan, para qué se usan y cómo ejercer tus derechos.',
    h1: 'Aviso de privacidad',
    schema: ['BreadcrumbList', 'WebPage'],
    index: true,
    ogImage: '/og/aviso-de-privacidad.png',
    breadcrumbs: crumbs('Aviso de privacidad', '/aviso-de-privacidad'),
    component: PrivacyNotice,
  },
  {
    path: '/terminos',
    title: 'Términos y condiciones | PediTrack',
    description: 'Términos y condiciones de uso de PediTrack, la bitácora médica de la familia: planes, pagos y responsabilidades.',
    h1: 'Términos y condiciones',
    schema: ['BreadcrumbList', 'WebPage'],
    index: true,
    ogImage: '/og/terminos.png',
    breadcrumbs: crumbs('Términos y condiciones', '/terminos'),
    component: Terms,
  },
  {
    path: '/404',
    title: 'Página no encontrada | PediTrack',
    description: 'La página que buscas no existe o cambió de dirección. Ve al inicio, a las funciones o a los planes de PediTrack.',
    h1: 'No encontramos esta página',
    schema: [],
    index: false,
    ogImage: '/og/inicio.png',
    breadcrumbs: [],
    component: NotFound,
  },
]

/** Las rutas del sitio, para las pruebas de redirecciones y enlaces. */
export const SITE_PATHS = PAGES.map((page) => page.path)

export function pageByPath(path: string): Page | undefined {
  return PAGES.find((page) => page.path === path)
}
