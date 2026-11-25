import { FAQ, appHost, faqText } from '../content/faq.ts'
import { FREE_PLAN, FULL_PLAN } from '../content/plans.ts'
import type { Page } from './pages.ts'
import type { SiteSettings } from './site.ts'

/** Un artículo del blog para el JSON-LD `Article` (fase 7). */
export interface ArticleMeta {
  headline: string
  datePublished: string
  dateModified: string
}

export interface SeoContext {
  /** Dirección pública del sitio, sin barra final. */
  origin: string
  settings: SiteSettings
  production: boolean
  article?: ArticleMeta
}

const OG_ALT = 'PediTrack, bitácora médica de la familia'
const APP_DESCRIPTION =
  'Bitácora médica de la familia: consultas, recetas, horario de tomas, cartilla de vacunación y crecimiento de tus hijos.'

/** La dirección completa de una ruta del sitio. */
export function absolute(origin: string, path: string): string {
  return path === '/' ? `${origin}/` : `${origin}${path}`
}

/** La página se pide que no se indexe: la 404 y, mientras no sea producción, todas (vista previa). */
export function isNoindex(page: Page, production: boolean): boolean {
  return !page.index || !production
}

/** Las redes configuradas (sin dirección no hay enlace ni `sameAs`). */
export function socialLinks(settings: SiteSettings): string[] {
  return [settings.social.facebook, settings.social.instagram].filter((url): url is string => Boolean(url?.trim()))
}

const numericPrice = (price: string) => price.replace(/[^0-9.]/g, '')

function organization(ctx: SeoContext) {
  const sameAs = socialLinks(ctx.settings)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ctx.origin}/#org`,
        name: 'PediTrack',
        url: `${ctx.origin}/`,
        logo: `${ctx.origin}/icon-512.png`,
        ...(sameAs.length > 0 ? { sameAs } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${ctx.origin}/#web`,
        url: `${ctx.origin}/`,
        name: 'PediTrack',
        inLanguage: 'es-MX',
        publisher: { '@id': `${ctx.origin}/#org` },
      },
    ],
  }
}

function softwareApplication() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'PediTrack',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web, iOS, Android',
    inLanguage: 'es-MX',
    description: APP_DESCRIPTION,
    offers: [
      { '@type': 'Offer', name: FREE_PLAN.name, price: numericPrice(FREE_PLAN.price), priceCurrency: 'MXN' },
      {
        '@type': 'Offer',
        name: FULL_PLAN.name,
        price: numericPrice(FULL_PLAN.price),
        priceCurrency: 'MXN',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: numericPrice(FULL_PLAN.price),
          priceCurrency: 'MXN',
          billingDuration: 'P1Y',
          unitCode: 'ANN',
        },
      },
    ],
  }
}

function breadcrumbList(page: Page, ctx: SeoContext) {
  const last = page.breadcrumbs.length - 1
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: page.breadcrumbs.map((crumb, at) => ({
      '@type': 'ListItem',
      position: at + 1,
      name: crumb.name,
      // La última miga es la página misma: sin dirección, como en el diseño.
      ...(at === last ? {} : { item: absolute(ctx.origin, crumb.path) }),
    })),
  }
}

function webPage(type: 'WebPage' | 'CollectionPage', page: Page, ctx: SeoContext) {
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: page.h1,
    url: absolute(ctx.origin, page.path),
    inLanguage: 'es-MX',
    description: page.description,
    isPartOf: { '@id': `${ctx.origin}/#web` },
  }
}

function faqPage(ctx: SeoContext) {
  const host = appHost(ctx.settings.appOrigin)
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: faqText(item.answer, host) },
    })),
  }
}

function article(page: Page, ctx: SeoContext) {
  const meta = ctx.article
  if (!meta) throw new Error(`${page.path}: Article necesita las fechas del artículo`)
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.headline,
    inLanguage: 'es-MX',
    datePublished: meta.datePublished,
    dateModified: meta.dateModified,
    author: { '@type': 'Organization', name: 'PediTrack' },
    publisher: { '@id': `${ctx.origin}/#org` },
    image: `${ctx.origin}${page.ogImage}`,
    mainEntityOfPage: absolute(ctx.origin, page.path),
  }
}

/** Los datos estructurados de una página, en el orden de su `schema`. */
export function jsonLd(page: Page, ctx: SeoContext): object[] {
  const out: object[] = []
  for (const type of page.schema) {
    switch (type) {
      case 'Organization':
        out.push(organization(ctx))
        break
      case 'WebSite':
        break // va dentro del grafo de Organization
      case 'SoftwareApplication':
        out.push(softwareApplication())
        break
      case 'BreadcrumbList':
        if (page.breadcrumbs.length > 0) out.push(breadcrumbList(page, ctx))
        break
      case 'WebPage':
      case 'CollectionPage':
        out.push(webPage(type, page, ctx))
        break
      case 'FAQPage':
        out.push(faqPage(ctx))
        break
      case 'Article':
        out.push(article(page, ctx))
        break
    }
  }
  return out
}

/** JSON para un `<script>`: nunca puede cerrar la etiqueta ni abrir otra. */
export function safeJson(value: object): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/** Todo lo que va en el `<head>` de una página (excepto los archivos de Vite, que agrega el documento). */
export function Seo({ page, ctx }: { page: Page; ctx: SeoContext }) {
  const url = absolute(ctx.origin, page.path)
  const noindex = isNoindex(page, ctx.production)
  const canonical = page.path !== '/404'
  const image = `${ctx.origin}${page.ogImage}`
  return (
    <>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{page.title}</title>
      <meta name="description" content={page.description} />
      <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />
      {canonical && <link rel="canonical" href={url} />}
      {canonical && <link rel="alternate" hrefLang="es-MX" href={url} />}
      <meta property="og:type" content={page.path.startsWith('/blog/') ? 'article' : 'website'} />
      <meta property="og:locale" content="es_MX" />
      <meta property="og:site_name" content="PediTrack" />
      <meta property="og:title" content={page.title} />
      <meta property="og:description" content={page.description} />
      {canonical && <meta property="og:url" content={url} />}
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={OG_ALT} />
      <meta name="twitter:card" content="summary_large_image" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="apple-touch-icon" href="/icon-192.png" />
      <link rel="preload" as="font" type="font/woff2" href="/fonts/figtree-var.woff2" crossOrigin="" />
      {jsonLd(page, ctx).map((data, at) => (
        <script key={at} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(data) }} />
      ))}
    </>
  )
}
