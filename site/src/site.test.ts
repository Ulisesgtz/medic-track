import { describe, expect, it } from 'vitest'
import { FAQ, FAQ_TOPICS, homeFaq } from '../content/faq.ts'
import { FREE_PLAN, FULL_PLAN, PLANS } from '../content/plans.ts'
import { builtPages, siteContext } from './build.ts'
import { renderForDev } from './dev.tsx'
import { PAGES } from './pages.ts'
import { appUrl, isProduction, loadSettings, siteOrigin } from './site.ts'

describe('site', () => {
  it('la dirección de la app sale de site.json y SITE_APP_ORIGIN la reemplaza', () => {
    expect(loadSettings({}).appOrigin).toBe('https://app.pedi-track.com')
    expect(loadSettings({ SITE_APP_ORIGIN: 'https://dev.pedi-track.com///' }).appOrigin).toBe('https://dev.pedi-track.com')
    expect(loadSettings({ SITE_APP_ORIGIN: '   ' }).appOrigin).toBe('https://app.pedi-track.com')
  })

  it('el sitio es pedi-track.com salvo que SITE_ORIGIN diga otra cosa', () => {
    expect(siteOrigin({})).toBe('https://pedi-track.com')
    expect(siteOrigin({ SITE_ORIGIN: 'https://preview.example.com/' })).toBe('https://preview.example.com')
  })

  it('solo SITE_ENV=production es producción', () => {
    expect(isProduction({ SITE_ENV: 'production' })).toBe(true)
    expect(isProduction({ SITE_ENV: 'preview' })).toBe(false)
    expect(isProduction({})).toBe(false)
  })

  it('appUrl pega la ruta al dominio de la app', () => {
    expect(appUrl(loadSettings({}), '/signup')).toBe('https://app.pedi-track.com/signup')
  })

  it('el contexto de la compilación junta ajustes, entorno y blog', () => {
    expect(siteContext({ SITE_ENV: 'production' }, true)).toMatchObject({ production: true, hasBlog: true, origin: 'https://pedi-track.com' })
    expect(siteContext({})).toMatchObject({ production: false, hasBlog: false })
  })

  it('solo las páginas con componente están construidas, y sin artículos listos no hay blog', () => {
    expect(builtPages().map((page) => page.path)).toEqual([
      '/',
      '/funciones',
      '/planes',
      '/privacidad',
      '/preguntas-frecuentes',
      '/instalar',
      '/aviso-de-privacidad',
      '/terminos',
      '/404',
    ])
    expect(builtPages(PAGES, []).every((page) => page.component)).toBe(true)
    expect(builtPages(PAGES, []).some((page) => page.path.startsWith('/blog'))).toBe(false)
  })

  it('el servidor de desarrollo dibuja las páginas construidas y nada más', () => {
    expect(renderForDev('/')).toContain('<h1')
    expect(renderForDev('')).toContain('<h1')
    expect(renderForDev('/src/styles.css')).toBeUndefined()
    expect(renderForDev('/no-existe')).toBeUndefined()
    expect(renderForDev('/')).toContain('/src/styles.css')
  })
})

describe('contenido', () => {
  it('15 preguntas en 5 temas y 6 en el inicio, en el orden del diseño', () => {
    expect(FAQ).toHaveLength(15)
    expect(new Set(FAQ.map((item) => item.topic))).toEqual(new Set(FAQ_TOPICS))
    expect(new Set(FAQ.map((item) => item.id)).size).toBe(15)
    expect(homeFaq().map((item) => item.id)).toEqual(['que-es', 'es-gratis', 'sustituye-al-pediatra', 'venden-datos', 'instalar-iphone', 'dejo-de-pagar'])
  })

  it('una pregunta marcada para el inicio pero fuera del orden va al final', () => {
    const extra = { ...FAQ[2], id: 'nueva', home: true }
    expect(homeFaq([...FAQ, extra]).at(-1)?.id).toBe('nueva')
  })

  it('las respuestas son texto plano (van igual en el HTML y en el JSON-LD)', () => {
    for (const item of FAQ) expect(item.answer).not.toMatch(/[<>]/)
  })

  it('los dos planes: Gratis MX$0 y Plan completo MX$499 al año', () => {
    expect(PLANS).toEqual([FREE_PLAN, FULL_PLAN])
    expect(FREE_PLAN.price).toBe('MX$0')
    expect(FULL_PLAN.price).toBe('MX$499')
    expect(FULL_PLAN.period).toMatch(/^al año/)
  })
})
