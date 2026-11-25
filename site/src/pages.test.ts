import { describe, expect, it } from 'vitest'
import { PAGES, SITE_PATHS, pageByPath } from './pages.ts'

describe('pages', () => {
  it('title de 60 caracteres o menos y description de 155 o menos', () => {
    for (const page of PAGES) {
      expect(page.title.length, `${page.path}: title`).toBeLessThanOrEqual(60)
      expect(page.description.length, `${page.path}: description`).toBeLessThanOrEqual(155)
      expect(page.title.length).toBeGreaterThan(0)
      expect(page.description.length).toBeGreaterThan(0)
    }
  })

  it('las rutas son únicas, en minúsculas y sin barra final', () => {
    expect(new Set(SITE_PATHS).size).toBe(SITE_PATHS.length)
    for (const path of SITE_PATHS) {
      expect(path.startsWith('/')).toBe(true)
      expect(path).toBe(path.toLowerCase())
      if (path !== '/') expect(path.endsWith('/')).toBe(false)
    }
  })

  it('solo la 404 pide no indexarse', () => {
    expect(PAGES.filter((page) => !page.index).map((page) => page.path)).toEqual(['/404'])
  })

  it('cada página tiene H1, una imagen para compartir y migas coherentes', () => {
    for (const page of PAGES) {
      expect(page.h1).not.toBe('')
      expect(page.ogImage).toMatch(/^\/og\/[a-z0-9-]+\.png$/)
      if (page.path === '/' || page.path === '/404') expect(page.breadcrumbs).toEqual([])
      else {
        expect(page.breadcrumbs[0]).toEqual({ name: 'Inicio', path: '/' })
        expect(page.breadcrumbs.at(-1)?.path).toBe(page.path)
      }
    }
  })

  it('el schema de cada página es el de la tabla de SEO', () => {
    expect(pageByPath('/')?.schema).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
    expect(pageByPath('/planes')?.schema).toContain('SoftwareApplication')
    expect(pageByPath('/preguntas-frecuentes')?.schema).toContain('FAQPage')
    expect(pageByPath('/blog')?.schema).toContain('CollectionPage')
    expect(pageByPath('/blog/organizar-recetas-hijos')?.schema).toContain('Article')
    expect(pageByPath('/privacidad')?.schema).toContain('WebPage')
    expect(pageByPath('/404')?.schema).toEqual([])
  })

  it('el inicio ya tiene su componente y pageByPath no inventa páginas', () => {
    expect(pageByPath('/')?.component).toBeTypeOf('function')
    expect(pageByPath('/no-existe')).toBeUndefined()
  })
})
