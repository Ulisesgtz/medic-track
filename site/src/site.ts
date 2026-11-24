import { createContext, useContext } from 'react'
import siteJson from '../content/site.json'
import type { Page } from './pages.ts'

/** Lo que el dueño edita en `content/site.json` (specs/080, contracts/contenido.md). */
export interface SiteSettings {
  contactEmail: string
  privacyEmail: string
  social: { facebook?: string; instagram?: string }
  appOrigin: string
}

/** La dirección pública del sitio: canonical, Open Graph, sitemap y JSON-LD. */
export const DEFAULT_SITE_ORIGIN = 'https://pedi-track.com'

type Env = Record<string, string | undefined>

const trimSlash = (value: string) => value.replace(/\/+$/, '')

/**
 * Los ajustes del sitio al compilar. `SITE_APP_ORIGIN` reemplaza la dirección de la app (la vista previa apunta a la de DEV) y
 * `SITE_ORIGIN` la del sitio.
 */
export function loadSettings(env: Env = process.env, base: SiteSettings = siteJson as SiteSettings): SiteSettings {
  return { ...base, appOrigin: trimSlash(env.SITE_APP_ORIGIN?.trim() || base.appOrigin) }
}

export function siteOrigin(env: Env = process.env): string {
  return trimSlash(env.SITE_ORIGIN?.trim() || DEFAULT_SITE_ORIGIN)
}

/** Producción es lo único que se indexa: cualquier otro valor (o ninguno) es vista previa. */
export function isProduction(env: Env = process.env): boolean {
  return env.SITE_ENV === 'production'
}

/** Una ruta de la app, en el dominio de la app. */
export function appUrl(settings: SiteSettings, path: string): string {
  return `${settings.appOrigin}${path}`
}

/** Lo que las páginas necesitan saber del sitio al dibujarse. */
export interface SiteContextValue {
  settings: SiteSettings
  /** `false` en la vista previa: nota de borrador y `noindex`. */
  production: boolean
  /** Hay artículos listos: sin ellos no hay blog ni enlaces a él. */
  hasBlog: boolean
  origin: string
}

export const SiteContext = createContext<SiteContextValue>({
  settings: siteJson as SiteSettings,
  production: false,
  hasBlog: false,
  origin: DEFAULT_SITE_ORIGIN,
})

export const useSite = () => useContext(SiteContext)

/** La página que se está dibujando (sus migas y su H1 salen de la tabla de SEO, no se repiten en cada componente). */
export const PageContext = createContext<Page | undefined>(undefined)

export function usePage(): Page {
  const page = useContext(PageContext)
  if (!page) throw new Error('usePage: no hay página en contexto (¿se dibujó fuera de renderPage?)')
  return page
}
