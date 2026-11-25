import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { check, main, pendingItems, placeholders, readSiteFiles, visibleText, type SiteFiles } from './production-check.ts'

const ready: SiteFiles = {
  pages: [{ file: 'dist/index.html', html: '<html><body><h1>Hola</h1><script type="application/ld+json">{"a":[1,2]}</script></body></html>' }],
  site: { contactEmail: 'hola@pedi-track.com', privacyEmail: 'privacidad@pedi-track.com' },
  legal: { reviewedByLawyer: true },
}

describe('production-check: texto', () => {
  it('el texto visible no incluye scripts, estilos ni etiquetas', () => {
    expect(visibleText('<p>Uno&nbsp;dos</p><style>a{b:[c]}</style><script>x[0]</script>')).toContain('Uno dos')
    expect(visibleText('<style>a{b:[c]}</style><script>x[0]</script>').trim()).toBe('')
  })

  it('encuentra cada relleno entre corchetes una sola vez', () => {
    expect(placeholders('<p>Es de <b>[titular]</b> y de [titular] en [ciudad]</p>')).toEqual(['[titular]', '[ciudad]'])
    expect(placeholders('<script>{"a":[1]}</script><p>sin relleno</p>')).toEqual([])
  })
})

describe('production-check: pendientes', () => {
  it('sin pendientes devuelve una lista vacía', () => {
    expect(pendingItems(ready)).toEqual([])
  })

  it('falta el correo de contacto', () => {
    const pending = pendingItems({ ...ready, site: { ...ready.site, contactEmail: '  ' } })
    expect(pending).toHaveLength(1)
    expect(pending[0]).toContain('contactEmail')
  })

  it('falta el correo de privacidad', () => {
    const pending = pendingItems({ ...ready, site: { contactEmail: 'a@b.mx' } })
    expect(pending).toHaveLength(1)
    expect(pending[0]).toContain('privacyEmail')
  })

  it('el abogado no ha revisado los documentos', () => {
    expect(pendingItems({ ...ready, legal: { reviewedByLawyer: false } })[0]).toContain('reviewedByLawyer')
    expect(pendingItems({ ...ready, legal: {} })[0]).toContain('reviewedByLawyer')
  })

  it('quedan corchetes en una página, incluida una legal, y dice cuáles y dónde', () => {
    const pending = pendingItems({
      ...ready,
      pages: [...ready.pages, { file: 'dist/terminos.html', html: '<p>Un servicio de <strong>[nombre o razón social]</strong></p>' }],
    })
    expect(pending).toEqual(['dist/terminos.html: texto de relleno sin completar: «[nombre o razón social]»'])
  })

  it('nombra todos los pendientes a la vez', () => {
    expect(pendingItems({ pages: [{ file: 'a.html', html: '[x]' }], site: {}, legal: {} })).toHaveLength(4)
  })
})

describe('production-check: sobre dist', () => {
  let base: string
  let root: string
  beforeEach(() => {
    // `legal/` vive junto a `site/`: base/site y base/legal.
    base = mkdtempSync(join(tmpdir(), 'check-'))
    root = join(base, 'site')
    mkdirSync(join(root, 'dist', 'blog'), { recursive: true })
    mkdirSync(join(root, 'content'))
    writeFileSync(join(root, 'dist', 'index.html'), '<p>Inicio</p>')
    writeFileSync(join(root, 'dist', 'terminos.html'), '<p>[titular]</p>')
    writeFileSync(join(root, 'dist', 'blog', 'guia.html'), '<p>Guía</p>')
    writeFileSync(join(root, 'content', 'site.json'), JSON.stringify({ contactEmail: '', privacyEmail: '' }))
  })
  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('lee las páginas y los archivos del dueño (sin legal/estado.json cuenta como no revisado)', () => {
    const files = readSiteFiles(root, 'dist')
    expect(files.pages.map((page) => page.file).sort()).toEqual(['dist/blog/guia.html', 'dist/index.html', 'dist/terminos.html'])
    expect(files.legal).toEqual({})
  })

  it('se niega si no hay dist', () => {
    expect(() => readSiteFiles(root, 'otro')).toThrow(/No hay otro/)
  })

  it('fuera de producción no revisa nada', () => {
    expect(check(root, {})).toEqual([])
    expect(check(root, { SITE_ENV: 'preview' })).toEqual([])
  })

  it('SITE_AUDIT=1 la omite aun en producción', () => {
    expect(check(root, { SITE_ENV: 'production', SITE_AUDIT: '1' })).toEqual([])
  })

  it('en producción lista los pendientes y main devuelve 1', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(check(root, { SITE_ENV: 'production' }).length).toBeGreaterThanOrEqual(4)
    expect(main(root, { SITE_ENV: 'production' })).toBe(1)
    const lines = error.mock.calls.map((call) => String(call[0])).join('\n')
    expect(lines).toContain('NO se puede publicar')
    expect(lines).toContain('contactEmail')
    expect(lines).toContain('privacyEmail')
    expect(lines).toContain('reviewedByLawyer')
    expect(lines).toContain('[titular]')
  })

  it('main devuelve 0 en vista previa y en auditoría', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(main(root, {})).toBe(0)
    expect(main(root, { SITE_ENV: 'production', SITE_AUDIT: '1' })).toBe(0)
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('main devuelve 0 con todo listo', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeFileSync(join(root, 'dist', 'terminos.html'), '<p>listo</p>')
    writeFileSync(join(root, 'content', 'site.json'), JSON.stringify({ contactEmail: 'a@b.mx', privacyEmail: 'p@b.mx' }))
    mkdirSync(join(base, 'legal'))
    writeFileSync(join(base, 'legal', 'estado.json'), JSON.stringify({ reviewedByLawyer: true }))
    expect(main(root, { SITE_ENV: 'production' })).toBe(0)
    expect(log.mock.calls.map((call) => String(call[0])).join('\n')).toContain('se puede publicar')
  })
})
