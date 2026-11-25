import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { builtPages } from './build.ts'
import { ogCards } from './ogCards.ts'
import { OgCard } from './pages/Og.tsx'
import { PAGES } from './pages.ts'
import { renderAll } from './test-utils.tsx'

// Las imágenes para compartir (R5, T035): cada `og:image` del HTML apunta a un PNG de 1200×630 que existe en public/og/.

const OG_DIR = resolve(process.cwd(), 'public', 'og')

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file)
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('imágenes para compartir', () => {
  it('cada og:image del HTML construido existe en public/og/ y mide 1200×630', () => {
    const images = new Set<string>()
    for (const { html } of renderAll({ SITE_ENV: 'production' })) {
      const match = /<meta property="og:image" content="https:\/\/pedi-track\.com(\/og\/[^"]+\.png)"/.exec(html)
      expect(match).not.toBeNull()
      images.add(match![1])
    }
    expect(images.size).toBeGreaterThan(5)
    for (const image of images) {
      const file = join(OG_DIR, image.replace('/og/', ''))
      expect(existsSync(file), `${image} no existe en public/og/`).toBe(true)
      expect(pngSize(file)).toEqual({ width: 1200, height: 630 })
    }
  })

  it('cada ogImage de la tabla de SEO (artículos en borrador incluidos) también existe', () => {
    for (const page of PAGES) expect(existsSync(join(OG_DIR, page.ogImage.replace('/og/', ''))), page.ogImage).toBe(true)
  })

  it('hay una tarjeta por cada imagen distinta y la 404 comparte la del inicio', () => {
    const cards = ogCards()
    const names = cards.map((card) => card.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names[0]).toBe('inicio')
    expect(new Set(PAGES.map((page) => page.ogImage)).size).toBe(names.length)
    expect(PAGES.find((page) => page.path === '/404')?.ogImage).toBe('/og/inicio.png')
  })

  it('las tarjetas cuentan con título, etiqueta y dirección, y los artículos llevan «Guía · Blog»', () => {
    for (const card of ogCards()) {
      expect(card.title.length).toBeGreaterThan(3)
      expect(card.url.startsWith('pedi-track.com')).toBe(true)
    }
    expect(ogCards().find((card) => card.name === 'blog-organizar-recetas')?.eyebrow).toBe('Guía · Blog')
    expect(ogCards().find((card) => card.name === 'planes')?.title).toContain('MX$499')
  })

  it('un artículo nuevo y listo recibe su propia tarjeta', () => {
    const extra = { ...PAGES.find((page) => page.path === '/blog/organizar-recetas-hijos')!, path: '/blog/otra-guia', ogImage: '/og/blog-otra-guia.png', h1: 'Otra guía' }
    const card = ogCards([...PAGES, extra]).find((candidate) => candidate.name === 'blog-otra-guia')
    expect(card).toMatchObject({ eyebrow: 'Guía · Blog', title: 'Otra guía', url: 'pedi-track.com/blog/otra-guia' })
    expect(builtPages().length).toBeGreaterThan(0)
  })

  it('el diseño del inicio y la plantilla se dibujan con sus textos', () => {
    const home = renderToStaticMarkup(createElement(OgCard, { card: ogCards()[0] }))
    expect(home).toContain('Los medicamentos y el historial de tus hijos, en un solo lugar')
    expect(home).toContain('Amoxicilina')
    const template = renderToStaticMarkup(createElement(OgCard, { card: { name: 'x', eyebrow: 'Etiqueta', title: 'Un título', url: 'pedi-track.com/x' } }))
    expect(template).toContain('Etiqueta')
    expect(template).toContain('Un título')
    expect(template).toContain('pedi-track.com/x')
    expect(template).toContain('Foto de la receta'.toUpperCase())
  })
})
