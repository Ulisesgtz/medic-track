import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PAGES, type Page } from './pages.ts'
import { Seo, absolute, isNoindex, jsonLd, safeJson, socialLinks, type SeoContext } from './seo.tsx'
import { loadSettings } from './site.ts'
import { page, renderDoc } from './test-utils.tsx'

const ctx: SeoContext = {
  origin: 'https://pedi-track.com',
  settings: loadSettings({}),
  production: true,
  article: { headline: 'Cómo organizar las recetas de tus hijos', datePublished: '2026-12-01', dateModified: '2026-12-02' },
}

const meta = (doc: Document, selector: string) => doc.head.querySelector(selector)?.getAttribute('content')

describe('Seo', () => {
  it('el head del inicio lleva title, description, canonical, hreflang, Open Graph y Twitter', () => {
    const { doc } = renderDoc(page('/'), { production: true })
    const home = page('/')
    expect(doc.documentElement.lang).toBe('es-MX')
    expect(doc.title).toBe(home.title)
    expect(meta(doc, 'meta[name="description"]')).toBe(home.description)
    expect(doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://pedi-track.com/')
    expect(doc.head.querySelector('link[rel="alternate"]')?.getAttribute('hreflang')).toBe('es-MX')
    expect(meta(doc, 'meta[property="og:type"]')).toBe('website')
    expect(meta(doc, 'meta[property="og:locale"]')).toBe('es_MX')
    expect(meta(doc, 'meta[property="og:url"]')).toBe('https://pedi-track.com/')
    expect(meta(doc, 'meta[property="og:image"]')).toBe('https://pedi-track.com/og/inicio.png')
    expect(meta(doc, 'meta[property="og:image:width"]')).toBe('1200')
    expect(meta(doc, 'meta[property="og:image:height"]')).toBe('630')
    expect(meta(doc, 'meta[property="og:image:alt"]')).toContain('PediTrack')
    expect(meta(doc, 'meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(doc.head.querySelector('link[rel="preload"][as="font"]')?.getAttribute('href')).toBe('/fonts/figtree-var.woff2')
  })

  it('en la vista previa toda página lleva noindex; en producción solo la 404', () => {
    expect(meta(renderDoc(page('/'), { production: false }).doc, 'meta[name="robots"]')).toBe('noindex, nofollow')
    expect(meta(renderDoc(page('/'), { production: true }).doc, 'meta[name="robots"]')).toBe('index, follow')
    expect(isNoindex(page('/404'), true)).toBe(true)
    expect(isNoindex(page('/planes'), true)).toBe(false)
    expect(isNoindex(page('/planes'), false)).toBe(true)
  })

  it('la 404 no tiene canonical ni og:url', () => {
    const html = renderToStaticMarkup(<Seo page={page('/404')} ctx={ctx} />)
    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('og:url')
    expect(html).toContain('noindex')
  })

  it('un artículo se marca como article y su canonical es su dirección', () => {
    const article = page('/blog/organizar-recetas-hijos')
    const html = renderToStaticMarkup(<Seo page={article} ctx={ctx} />)
    expect(html).toContain('content="article"')
    expect(html).toContain('href="https://pedi-track.com/blog/organizar-recetas-hijos"')
  })

  it('todo el JSON-LD es JSON válido', () => {
    for (const candidate of PAGES) {
      const html = renderToStaticMarkup(<Seo page={candidate} ctx={ctx} />)
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      for (const script of scripts) expect(() => JSON.parse(script[1])).not.toThrow()
    }
  })
})

describe('jsonLd', () => {
  it('el inicio: Organization con WebSite y SoftwareApplication con las dos ofertas', () => {
    const data = jsonLd(page('/'), ctx) as Array<Record<string, unknown>>
    expect(data).toHaveLength(2)
    const graph = data[0]['@graph'] as Array<Record<string, unknown>>
    expect(graph.map((item) => item['@type'])).toEqual(['Organization', 'WebSite'])
    expect(graph[0].logo).toBe('https://pedi-track.com/icon-512.png')
    const offers = data[1].offers as Array<Record<string, unknown>>
    expect(offers.map((offer) => offer.price)).toEqual(['0', '499'])
    expect(offers[1]).toMatchObject({ priceCurrency: 'MXN', priceSpecification: { billingDuration: 'P1Y', unitCode: 'ANN' } })
  })

  it('sameAs solo lleva las redes configuradas', () => {
    const none = jsonLd(page('/'), ctx)[0] as { '@graph': Array<Record<string, unknown>> }
    expect(none['@graph'][0]).not.toHaveProperty('sameAs')
    const social = { facebook: 'https://facebook.com/x', instagram: '' }
    const withSocial = jsonLd(page('/'), { ...ctx, settings: { ...ctx.settings, social } })[0] as { '@graph': Array<Record<string, unknown>> }
    expect(withSocial['@graph'][0].sameAs).toEqual(['https://facebook.com/x'])
    expect(socialLinks({ ...ctx.settings, social: {} })).toEqual([])
  })

  it('las páginas interiores llevan BreadcrumbList sin dirección en la última miga', () => {
    const [crumbs] = jsonLd(page('/funciones'), ctx) as Array<{ '@type': string; itemListElement: Array<Record<string, unknown>> }>
    expect(crumbs['@type']).toBe('BreadcrumbList')
    expect(crumbs.itemListElement[0]).toMatchObject({ position: 1, name: 'Inicio', item: 'https://pedi-track.com/' })
    expect(crumbs.itemListElement[1]).not.toHaveProperty('item')
  })

  it('/planes, /privacidad y /blog llevan sus tipos', () => {
    expect(jsonLd(page('/planes'), ctx).map((item) => (item as { '@type': string })['@type'])).toEqual(['BreadcrumbList', 'SoftwareApplication'])
    expect(jsonLd(page('/privacidad'), ctx)[1]).toMatchObject({ '@type': 'WebPage', url: 'https://pedi-track.com/privacidad' })
    expect(jsonLd(page('/blog'), ctx)[0]).toMatchObject({ '@type': 'CollectionPage' })
  })

  it('FAQPage lleva una entrada por pregunta y solo existe en las preguntas frecuentes', () => {
    const faq = jsonLd(page('/preguntas-frecuentes'), ctx).find((item) => (item as { '@type': string })['@type'] === 'FAQPage') as {
      mainEntity: unknown[]
    }
    expect(faq.mainEntity).toHaveLength(15)
    for (const candidate of PAGES.filter((other) => other.path !== '/preguntas-frecuentes'))
      expect(JSON.stringify(jsonLd(candidate, ctx))).not.toContain('FAQPage')
  })

  it('Article necesita las fechas del artículo', () => {
    const article = page('/blog/organizar-recetas-hijos')
    expect(jsonLd(article, ctx)[0]).toMatchObject({ '@type': 'Article', datePublished: '2026-12-01', dateModified: '2026-12-02', inLanguage: 'es-MX' })
    expect(() => jsonLd(article, { ...ctx, article: undefined })).toThrow(/Article/)
  })

  it('BreadcrumbList sin migas no escribe nada', () => {
    const bare: Page = { ...page('/'), schema: ['BreadcrumbList'], breadcrumbs: [] }
    expect(jsonLd(bare, ctx)).toEqual([])
  })
})

describe('helpers', () => {
  it('absolute arma la dirección completa', () => {
    expect(absolute('https://pedi-track.com', '/')).toBe('https://pedi-track.com/')
    expect(absolute('https://pedi-track.com', '/planes')).toBe('https://pedi-track.com/planes')
  })

  it('safeJson no deja cerrar la etiqueta ni abrir otra', () => {
    const text = safeJson({ a: '</script><b>&' })
    expect(text).not.toContain('<')
    expect(text).not.toContain('>')
    expect(text).not.toContain('&')
    expect(JSON.parse(text)).toEqual({ a: '</script><b>&' })
  })
})
