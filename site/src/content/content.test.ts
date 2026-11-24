import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BlogFormatError, blogDir, loadArticles, parseArticle, readyArticles } from './blog.ts'
import { formatLongDate, parseLegal, readLegalDoc, readLegalStatus, updatedLine } from './legal.ts'
import { anchorId, createMarked, plainText, slugify } from './markdown.ts'

const LEGAL = `# Título del documento

> **BORRADOR.** Esto no se publica.

**Última actualización:** [fecha de publicación]

Texto de entrada con **negritas** y un [enlace](/aviso-de-privacidad).

## 1. Primera sección

- Uno: **dos**
- Tres con \`código\`

### Subtítulo

1. Paso uno
2. Paso dos

## Segunda sección

| Proveedor | Para qué |
|---|---|
| Clerk | Cuentas |
| Railway | Servidores |

## Segunda sección
`

describe('parseLegal', () => {
  const content = parseLegal(LEGAL)

  it('quita el título, el borrador y la línea de la fecha', () => {
    const all = content.introHtml + content.sections.map((section) => section.html).join('')
    expect(all).not.toContain('Título del documento')
    expect(all).not.toContain('BORRADOR')
    expect(all).not.toContain('Última actualización')
  })

  it('el texto antes del primer «##» es la entrada', () => {
    expect(content.introHtml).toContain('<strong class="font-bold text-ink">negritas</strong>')
    expect(content.introHtml).toContain('href="/aviso-de-privacidad"')
  })

  it('una sección por «##», con su ancla (sin repetirse) y el índice sale de ellas', () => {
    expect(content.sections.map((section) => section.id)).toEqual(['seccion-1-primera-seccion', 'segunda-seccion', 'segunda-seccion-bis'])
    expect(content.sections.map((section) => section.title)).toEqual(['1. Primera sección', 'Segunda sección', 'Segunda sección'])
  })

  it('listas, subtítulos y código llevan las clases del diseño', () => {
    const first = content.sections[0].html
    expect(first).toContain('<ul class="m-0 flex flex-col gap-1.5 pl-[22px] list-disc">')
    expect(first).toContain('<ol class=')
    expect(first).toContain('<h3 class="mt-1 mb-0 text-lg font-extrabold text-ink">Subtítulo</h3>')
    expect(first).toContain('<code>código</code>')
  })

  it('una tabla pasa a lista con «—», como el diseño', () => {
    const table = content.sections[1].html
    expect(table).not.toContain('<table')
    expect(table).toContain('Clerk — Cuentas')
    expect(table).toContain('Railway — Servidores')
  })

  it('sin «##» todo es entrada', () => {
    const only = parseLegal('# Solo título\n\nUn párrafo.')
    expect(only.sections).toEqual([])
    expect(only.introHtml).toContain('Un párrafo.')
  })

  it('los tres documentos del repositorio tienen secciones y ningún enlace a un archivo .md', () => {
    for (const doc of ['privacidad-y-seguridad', 'aviso-de-privacidad', 'terminos-y-condiciones'] as const) {
      const real = readLegalDoc(doc)
      expect(real.sections.length, doc).toBeGreaterThan(4)
      expect(JSON.stringify(real), doc).not.toMatch(/\.md\)|href="[^"]*\.md"/)
    }
  })

  it('el estado legal se lee y la línea de fecha usa el relleno mientras no hay fecha', () => {
    expect(readLegalStatus()).toEqual({ reviewedByLawyer: false, date: null })
    expect(updatedLine({ reviewedByLawyer: false, date: null })).toBe('Última actualización: [fecha de publicación]')
    expect(updatedLine({ reviewedByLawyer: true, date: '2026-12-01' })).toBe('Última actualización: 1 de diciembre de 2026')
  })

  it('formatLongDate escribe el mes con letra y devuelve igual lo que no es fecha', () => {
    expect(formatLongDate('2026-01-09')).toBe('9 de enero de 2026')
    expect(formatLongDate('2026-13-09')).toBe('2026-13-09')
    expect(formatLongDate('ayer')).toBe('ayer')
  })
})

describe('markdown', () => {
  it('slugify quita acentos y signos; plainText toma el texto de los títulos', () => {
    expect(slugify('¿Qué es PediTrack? — Sí')).toBe('que-es-peditrack-si')
    expect(slugify('***')).toBe('')
    expect(anchorId('1. Responsable')).toBe('seccion-1-responsable')
    expect(anchorId('Lo que sí hacemos')).toBe('lo-que-si-hacemos')
    expect(anchorId('***')).toBe('seccion')
    expect(plainText(undefined, 'respaldo')).toBe('respaldo')
    expect(plainText([{ type: 'text', raw: 'a', text: 'Hola ' }, { type: 'strong', raw: '**b**', tokens: [{ type: 'text', raw: 'b', text: 'mundo' }] }] as never)).toBe('Hola mundo')
  })

  it('el código en línea se escapa una sola vez', () => {
    expect(createMarked('legal').parse('Usa `<fecha> & x` aquí')).toContain('<code>&lt;fecha&gt; &amp; x</code>')
  })

  it('el estilo de artículo usa letras más grandes que el legal', () => {
    const html = createMarked('article').parse('Hola\n\n- uno\n- dos')
    expect(html).toContain('text-[17px]')
    expect(createMarked('legal').parse('Hola')).toContain('text-base')
  })

  it('un enlace con comillas no rompe el atributo', () => {
    expect(createMarked('legal').parse('[x](/a?b="c")')).toContain('&quot;')
  })
})

const GOOD = `---
title: Una guía | PediTrack
description: Una descripción corta.
datePublished: 2026-12-01
dateModified: 2026-12-03
ready: true
---

Entrada de la guía.

## Primera parte

Texto uno.

## Segunda parte

Texto dos.
`

describe('parseArticle', () => {
  it('lee el encabezado, la entrada y las secciones', () => {
    const article = parseArticle('content/blog/una-guia.md', GOOD)
    expect(article).toMatchObject({ slug: 'una-guia', title: 'Una guía | PediTrack', ready: true, datePublished: '2026-12-01', dateModified: '2026-12-03' })
    expect(article.introHtml).toContain('Entrada de la guía.')
    expect(article.sections.map((section) => section.id)).toEqual(['primera-parte', 'segunda-parte'])
    expect(article.readMinutes).toBe(1)
  })

  it('acepta comillas en el encabezado y un encabezado con BOM y saltos de Windows', () => {
    const article = parseArticle('a.md', `\uFEFF${GOOD.replace('title: Una guía | PediTrack', 'title: "Una guía | PediTrack"').replace(/\n/g, '\r\n')}`)
    expect(article.title).toBe('Una guía | PediTrack')
  })

  const fail = (text: string, message: RegExp, file = 'mala.md') => {
    try {
      parseArticle(file, text)
    } catch (error) {
      expect(error).toBeInstanceOf(BlogFormatError)
      expect((error as Error).message).toMatch(message)
      return
    }
    throw new Error('debía fallar')
  }

  it('detiene la compilación con el archivo y la línea', () => {
    fail(GOOD.replace('---\n', ''), /^mala\.md:1: el artículo debe empezar con «---»/)
    fail('---\ntitle: x\n', /mala\.md:1: falta el «---» que cierra/)
    fail(GOOD.replace('title: Una guía | PediTrack', 'título sin dos puntos'), /mala\.md:2: se esperaba «clave: valor»/)
    fail(GOOD.replace('ready: true', 'autor: yo'), /mala\.md:6: clave desconocida «autor»/)
    fail(GOOD.replace('ready: true', 'ready: true\nready: false'), /mala\.md:7: la clave «ready» está repetida/)
    fail(GOOD.replace('description: Una descripción corta.\n', ''), /falta «description»/)
    fail(GOOD.replace('title: Una guía | PediTrack', `title: ${'x'.repeat(61)}`), /mala\.md:2: title de 61 caracteres/)
    fail(GOOD.replace('Una descripción corta.', 'x'.repeat(156)), /mala\.md:3: description de 156 caracteres/)
    fail(GOOD.replace('2026-12-01', '2026-02-30'), /mala\.md:4: «2026-02-30» no es una fecha real/)
    fail(GOOD.replace('2026-12-01', '1 de diciembre'), /no es una fecha real/)
    fail(GOOD.replace('2026-12-03', '2026-11-30'), /mala\.md:5: dateModified no puede ser anterior/)
    fail(GOOD.replace('ready: true', 'ready: tal vez'), /mala\.md:6: ready debe ser true o false/)
    fail(GOOD, /debe ser minúsculas/, 'Mala Guía.md')
    fail(GOOD.replace('Entrada de la guía.', '# Otro título'), /no uses «#»/)
    fail(GOOD.replace(/## [\s\S]*$/, 'Sin secciones.'), /al menos una sección/)
  })

  it('cuenta los minutos de lectura por 200 palabras', () => {
    const long = GOOD.replace('Texto uno.', 'palabra '.repeat(450))
    expect(parseArticle('a.md', long).readMinutes).toBe(3)
  })
})

describe('carpetas', () => {
  const here = process.cwd()
  afterEach(() => process.chdir(here))

  it('blogDir sale de la ubicación del módulo y SITE_BLOG_DIR es relativa a la raíz del sitio, no al directorio actual', () => {
    const root = resolve(here)
    expect(blogDir({})).toBe(join(root, 'content', 'blog'))
    expect(blogDir({ SITE_BLOG_DIR: 'e2e/fixtures/blog' })).toBe(join(root, 'e2e', 'fixtures', 'blog'))
    expect(blogDir({ SITE_BLOG_DIR: '  ' })).toBe(join(root, 'content', 'blog'))
    process.chdir(tmpdir())
    expect(blogDir({ SITE_BLOG_DIR: 'e2e/fixtures/blog' })).toBe(join(root, 'e2e', 'fixtures', 'blog'))
    expect(loadArticles().length).toBeGreaterThan(0)
    expect(readLegalStatus()).toEqual({ reviewedByLawyer: false, date: null })
    expect(readLegalDoc('terminos-y-condiciones').sections.length).toBeGreaterThan(0)
  })
})

describe('loadArticles', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blog-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('ordena del más reciente al más antiguo y solo publica los listos', () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a-vieja.md'), GOOD.replace('2026-12-01', '2026-11-01').replace('ready: true', 'ready: false'))
    writeFileSync(join(dir, 'b-nueva.md'), GOOD)
    writeFileSync(join(dir, 'leeme.txt'), 'no es un artículo')
    const articles = loadArticles(dir)
    expect(articles.map((article) => article.slug)).toEqual(['b-nueva', 'a-vieja'])
    expect(readyArticles(articles).map((article) => article.slug)).toEqual(['b-nueva'])
  })

  it('los tres borradores del repositorio están en el formato y ninguno está listo', () => {
    const drafts = loadArticles()
    expect(drafts.map((article) => article.slug).sort()).toEqual(['no-olvidar-tomas-antibiotico', 'organizar-recetas-hijos', 'que-llevar-consulta-pediatra'])
    expect(readyArticles(drafts)).toEqual([])
  })
})
