import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAll, visibleText } from './test-utils.tsx'

// Principio I (FR-010): el sitio registra y recuerda; nunca promete salud ni aconseja. Revisa todo el HTML generado y el contenido
// que edita el dueño. Una frase prohibida SIN negar no pasa; «no diagnostica» (la aclaración de lo que la app no hace) sí.

const FORBIDDEN: Array<[string, RegExp]> = [
  ['diagnostica', /(?<!no )(?<!ni )\bdiagnostica/i],
  ['diagnóstico', /(?<!no )(?<!ni )\bdiagnóstico/i],
  ['previene', /(?<!no )(?<!ni )\bprevien(e|en)\b/i],
  ['prevenir', /(?<!no )(?<!ni )\bprevenir\b/i],
  ['detecta', /(?<!no )(?<!ni )\bdetect(a|an|ar)\b/i],
  ['controla tu salud', /controla (tu|la) salud/i],
  ['garantiza', /(?<!no )\bgarantiz(a|an)\b/i],
  ['dosis recomendada', /dosis recomendada/i],
  ['cura', /(?<!no )\bcur(a|an)\b/i],
  ['tratamiento ideal', /tratamiento ideal/i],
  ['síntomas graves', /s[ií]ntomas graves/i],
  ['alerta', /\balerta(s)?\b/i],
  ['riesgo', /\briesgo(s)?\b/i],
  ['normal / anormal', /\b(anormal|normal para su edad)\b/i],
  ['percentil bajo o alto', /percentil (bajo|alto)/i],
]

/** Todo el texto escrito en archivos que edita el dueño o que son datos de las páginas. */
function files(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path, extensions)
    return extensions.some((extension) => name.endsWith(extension)) && !name.includes('.test.') ? [path] : []
  })
}

const rendered = renderAll({ SITE_ENV: 'production' })
const sources = [...files(resolve(process.cwd(), 'content'), ['.ts', '.md', '.json']), ...files(resolve(process.cwd(), 'src/pages'), ['.tsx'])]

describe('redacción (Principio I)', () => {
  it('hay páginas y archivos que revisar', () => {
    expect(rendered.length).toBeGreaterThan(0)
    expect(sources.length).toBeGreaterThan(2)
  })

  for (const [name, pattern] of FORBIDDEN) {
    it(`ninguna página dice «${name}» sin negarlo`, () => {
      for (const { page, html } of rendered) expect(visibleText(html), page.path).not.toMatch(pattern)
    })
    it(`ningún archivo de contenido dice «${name}» sin negarlo`, () => {
      for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(pattern)
    })
  }

  it('la aclaración de lo que la app no hace sí está (se dice negada)', () => {
    const text = rendered.map(({ html }) => visibleText(html)).join(' ')
    expect(text).toContain('no diagnostica')
    expect(text).toContain('no sustituye la consulta ni el criterio de tu médico')
  })

  it('el detector distingue lo negado de lo afirmado', () => {
    const diagnostica = FORBIDDEN[0][1]
    expect('La app diagnostica a tu hijo').toMatch(diagnostica)
    expect('PediTrack no diagnostica').not.toMatch(diagnostica)
    expect('ni diagnostica ni aconseja').not.toMatch(diagnostica)
  })

  // Los tres documentos legales traen los corchetes del dueño (razón social, correo, fecha) hasta que los complete: eso lo bloquea
  // `scripts/production-check.ts` (T036) al publicar, no esta prueba.
  const LEGAL_PATHS = ['/privacidad', '/aviso-de-privacidad', '/terminos']

  it('en producción no queda ningún texto de relleno entre corchetes (salvo los documentos legales)', () => {
    for (const { page, html } of rendered.filter(({ page }) => !LEGAL_PATHS.includes(page.path))) {
      expect(visibleText(html), page.path).not.toMatch(/\[[^\]]*\]/)
    }
  })

  it('el contenido que se lee de los archivos tampoco trae corchetes de relleno cuando SITE_ENV=production', () => {
    if (process.env.SITE_ENV !== 'production') return
    for (const file of files(resolve(process.cwd(), 'content'), ['.md'])) expect(readFileSync(file, 'utf8'), file).not.toMatch(/\[[^\]]*\]/)
  })
})
