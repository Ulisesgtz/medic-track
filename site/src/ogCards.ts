import { FULL_PLAN } from '../content/plans.ts'
import { builtPages } from './build.ts'
import type { OgCardData } from './pages/Og.tsx'
import { PAGES, type Page } from './pages.ts'

// Lo que dice la imagen para compartir de cada página (R5). Títulos cortos: la plantilla da tres líneas de 66 px. Sin consejos ni
// afirmaciones médicas (Principio I).
const TEMPLATE_TEXT: Record<string, { eyebrow: string; title: string }> = {
  '/funciones': { eyebrow: 'Funciones', title: 'Consultas, tomas, vacunas y crecimiento en un solo lugar' },
  '/planes': { eyebrow: 'Planes', title: `Gratis o Plan completo de ${FULL_PLAN.price} al año` },
  '/privacidad': { eyebrow: 'Privacidad y seguridad', title: 'Tus datos son tuyos' },
  '/preguntas-frecuentes': { eyebrow: 'Preguntas frecuentes', title: 'Respuestas sobre PediTrack' },
  '/blog': { eyebrow: 'Blog y guías', title: 'Guías para organizar recetas, tomas y consultas' },
  '/instalar': { eyebrow: 'Instalar la app', title: 'Instala PediTrack en tu teléfono, paso a paso' },
  '/aviso-de-privacidad': { eyebrow: 'Legal', title: 'Aviso de privacidad' },
  '/terminos': { eyebrow: 'Legal', title: 'Términos y condiciones' },
}

const nameOf = (page: Page) => page.ogImage.replace(/^\/og\//, '').replace(/\.png$/, '')

function cardFor(page: Page): OgCardData {
  const url = `pedi-track.com${page.path === '/' ? '' : page.path}`
  const text = TEMPLATE_TEXT[page.path]
  if (text) return { name: nameOf(page), url, ...text }
  // Un artículo del blog: la etiqueta del mock y su título.
  return { name: nameOf(page), eyebrow: 'Guía · Blog', title: page.h1, url }
}

/**
 * Una imagen por cada `ogImage` distinta que referencian la tabla de SEO y las páginas construidas (artículos nuevos incluidos). La
 * 404 comparte la del inicio.
 */
export function ogCards(pages: Page[] = [...PAGES, ...builtPages()]): OgCardData[] {
  const seen = new Set<string>()
  const cards: OgCardData[] = []
  for (const page of pages) {
    if (seen.has(page.ogImage)) continue
    seen.add(page.ogImage)
    cards.push(cardFor(page))
  }
  return cards
}
