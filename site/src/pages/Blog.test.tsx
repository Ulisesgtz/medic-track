import { describe, expect, it } from 'vitest'
import { parseArticle, type BlogArticle } from '../content/blog.ts'
import { PAGES } from '../pages.ts'
import { builtPages, hasBlog, siteContext } from '../build.ts'
import { renderPage } from '../render.tsx'
import { ASSETS } from '../test-utils.tsx'
import { sitemapXml } from '../../scripts/seo-files.ts'

// El blog con artículos de muestra `ready: true` (solo en estas pruebas: los borradores del repositorio no están listos).

const sample = (slug: string, overrides: Record<string, string> = {}, body = 'Entrada de la guía.\n\n## Primera parte\n\nTexto uno.\n\n## Segunda parte\n\n- uno\n- dos\n'): BlogArticle => {
  const fields = { title: `Guía ${slug} | PediTrack`, description: 'Una descripción.', datePublished: '2026-12-01', dateModified: '2026-12-02', ready: 'true', ...overrides }
  const head = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')
  return parseArticle(`${slug}.md`, `---\n${head}\n---\n\n${body}`)
}

const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
const render = (path: string, articles: BlogArticle[]) => {
  const pages = builtPages(PAGES, articles)
  const found = pages.find((candidate) => candidate.path === path)
  if (!found) throw new Error(`sin página ${path}`)
  const html = renderPage(found, { site: siteContext({ SITE_ENV: 'production' }, hasBlog(articles)), assets: ASSETS, article: found.article })
  return new DOMParser().parseFromString(html, 'text/html')
}

const READY = [sample('organizar-recetas-hijos', { title: 'Cómo organizar las recetas de tus hijos | PediTrack' }), sample('guia-nueva', { datePublished: '2026-12-05', dateModified: '2026-12-05' }), sample('tercera-guia')]

describe('sin artículos listos no hay blog', () => {
  it('ni /blog ni artículos ni enlace «Blog»', () => {
    const draft = sample('organizar-recetas-hijos', { ready: 'false' })
    for (const articles of [[], [draft]]) {
      const paths = builtPages(PAGES, articles).map((page) => page.path)
      expect(paths.some((path) => path.startsWith('/blog')), String(articles.length)).toBe(false)
      expect(hasBlog(articles)).toBe(false)
      expect(sitemapXml('https://pedi-track.com', builtPages(PAGES, articles))).not.toContain('/blog')
    }
    const footer = new DOMParser().parseFromString(renderPage(PAGES[0], { site: siteContext({}, false), assets: ASSETS }), 'text/html').querySelector('footer')
    expect(footer?.querySelector('a[href="/blog"]')).toBeNull()
  })
})

describe('con artículos listos', () => {
  it('se escribe /blog y un artículo por cada listo, y entran al sitemap', () => {
    const paths = builtPages(PAGES, READY).map((page) => page.path)
    expect(paths).toEqual(expect.arrayContaining(['/blog', '/blog/organizar-recetas-hijos', '/blog/guia-nueva', '/blog/tercera-guia']))
    expect(paths.at(-1)).toBe('/blog/tercera-guia')
    const xml = sitemapXml('https://pedi-track.com', builtPages(PAGES, READY))
    expect(xml).toContain('/blog/guia-nueva')
    expect(xml).toContain('<loc>https://pedi-track.com/blog</loc>')
  })

  it('el pie enlaza a «Blog y guías»', () => {
    const doc = render('/blog', READY)
    expect(doc.querySelector('footer a[href="/blog"]')).not.toBeNull()
  })

  describe('listado', () => {
    const doc = render('/blog', READY)

    it('un solo H1, la guía destacada primero y las demás en rejilla', () => {
      expect(doc.querySelectorAll('h1')).toHaveLength(1)
      expect(text(doc.querySelector('h1'))).toBe('Guías para organizar las recetas, tomas y consultas de tus hijos')
      const cards = [...doc.querySelectorAll('main article')]
      expect(cards).toHaveLength(3)
      expect(text(cards[0].querySelector('h2'))).toBe('Guía guia-nueva')
      expect(cards[0].className).toContain('web:flex-row')
      expect(cards[1].className).not.toContain('web:flex-row')
    })

    it('cada tarjeta lleva «Guía», minutos de lectura, la portada descrita y el enlace', () => {
      const card = doc.querySelector('main article') as Element
      expect([...card.querySelectorAll('span')].map(text)).toContain('Guía')
      expect(text(card)).toContain('1 min de lectura')
      expect(card.querySelector('a[href="/blog/guia-nueva"]')).not.toBeNull()
      expect(card.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Ilustración de la guía: Guía guia-nueva | PediTrack')
      // Solo las guías con captura asignada (organizar-recetas-hijos) dibujan una pantalla; las demás, el fondo celeste.
      const covers = [...doc.querySelectorAll('main article > div[role="img"]')]
      expect(covers.map((cover) => cover.children.length)).toEqual([0, 1, 0])
    })

    it('es una CollectionPage con migas', () => {
      const json = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((script) => script.textContent).join('')
      expect(json).toContain('CollectionPage')
      expect(json).toContain('BreadcrumbList')
    })
  })

  describe('artículo', () => {
    const doc = render('/blog/organizar-recetas-hijos', READY)

    it('un solo H1 (el de la tabla de SEO), la fecha real y los minutos', () => {
      expect(doc.querySelectorAll('h1')).toHaveLength(1)
      expect(text(doc.querySelector('h1'))).toBe('Cómo organizar las recetas de tus hijos')
      expect(text(doc.querySelector('main article'))).toContain('Por el equipo de PediTrack · 1 de diciembre de 2026 · 1 min de lectura')
      expect(doc.querySelector('time')?.getAttribute('datetime')).toBe('2026-12-01')
    })

    it('lleva el aviso fijo de que es de organización, no consejo médico', () => {
      expect(text(doc.querySelector('[role="note"]'))).toContain('Esta guía habla de organización, no de salud.')
      expect(text(doc.querySelector('[role="note"]'))).toContain('no sustituye la consulta ni el criterio de tu médico')
    })

    it('secciones con ancla, el índice «En esta guía» y enlaces a planes, funciones y las otras guías', () => {
      expect([...doc.querySelectorAll('main article h2')].map(text)).toEqual(['Primera parte', 'Segunda parte'])
      const nav = [...doc.querySelectorAll('nav[aria-label="Contenido"] a')]
      expect(nav.map((link) => link.getAttribute('href'))).toEqual(['#primera-parte', '#segunda-parte'])
      expect(doc.getElementById('segunda-parte')).not.toBeNull()
      expect(doc.querySelector('main a[href="/planes"]')).not.toBeNull()
      expect(doc.querySelector('main a[href="/funciones"]')).not.toBeNull()
      expect([...doc.querySelectorAll('main article a[href^="/blog/"]')].map((link) => link.getAttribute('href'))).toEqual(['/blog/guia-nueva', '/blog/tercera-guia'])
    })

    it('el JSON-LD Article lleva las fechas del archivo y la imagen', () => {
      const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent ?? '{}'))
      const article = scripts.find((json) => json['@type'] === 'Article')
      expect(article).toMatchObject({ headline: 'Cómo organizar las recetas de tus hijos', datePublished: '2026-12-01', dateModified: '2026-12-02' })
      expect(article.image).toContain('/og/blog-organizar-recetas.png')
      expect(doc.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('article')
    })

    it('el título y la descripción son los del archivo', () => {
      expect(doc.title).toBe('Cómo organizar las recetas de tus hijos | PediTrack')
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Una descripción.')
    })
  })

  it('un artículo que no está en la tabla de SEO arma su página con lo que dice el archivo', () => {
    const doc = render('/blog/guia-nueva', READY)
    expect(text(doc.querySelector('h1'))).toBe('Guía guia-nueva')
    expect([...doc.querySelectorAll('nav[aria-label="Migas de pan"] a')].map((link) => link.getAttribute('href'))).toEqual(['/', '/blog'])
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toContain('/og/blog-guia-nueva.png')
  })

  it('un artículo sin otros no tiene «Sigue leyendo»', () => {
    const doc = render('/blog/guia-nueva', [sample('guia-nueva')])
    expect(text(doc.querySelector('main article'))).not.toContain('Sigue leyendo')
    expect(doc.querySelector('main a[href="/funciones"]')).not.toBeNull()
  })

  it('con un solo artículo el listado no dibuja rejilla', () => {
    const doc = render('/blog', [sample('guia-nueva')])
    expect(doc.querySelectorAll('main article')).toHaveLength(1)
  })
})
