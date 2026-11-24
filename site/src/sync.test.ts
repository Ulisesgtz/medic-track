import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FREE_PLAN, FULL_PLAN } from '../content/plans.ts'
import { FREE_ITEMS, FULL_ITEMS, PLAN_PERIOD, PLAN_PRICE } from '../../frontend/src/features/plans/planCopy.ts'

// El sitio copia los tokens y los precios de la app en vez de compartir código (spec 080, R9). Estas pruebas fallan si se separan.

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8')

function colorTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) tokens.set(match[1], match[2].trim())
  return tokens
}

// Los colores que solo el sitio usa (ilustraciones de «Instalar la app»): no existen en la app.
const SITE_ONLY = ['bar', 'menu-row', 'tile']

describe('tokens de color', () => {
  const app = colorTokens(read('../frontend/src/index.css'))
  const site = colorTokens(read('src/theme.css'))

  it('el sitio tiene los tokens de la app', () => {
    expect(site.size).toBeGreaterThan(30)
    expect(app.size).toBeGreaterThan(30)
  })

  it('cada token del sitio existe en la app con el mismo valor', () => {
    const different = [...site].filter(([name, value]) => !SITE_ONLY.includes(name) && app.get(name) !== value).map(([name]) => name)
    expect(different).toEqual([])
  })

  it('los colores solo del sitio están en el sitio y la app no tiene uno con ese nombre', () => {
    for (const name of SITE_ONLY) {
      expect(site.has(name), name).toBe(true)
      expect(app.has(name), name).toBe(false)
    }
  })

  it('el sitio copia todos los tokens de color de la app (un token nuevo allá se copia aquí)', () => {
    const missing = [...app.keys()].filter((name) => !site.has(name))
    expect(missing).toEqual([])
  })

  it('el interlineado normal del mock no se aplica a nada más que a los tamaños con nombre', () => {
    expect(read('src/theme.css')).toContain('--text-sm--line-height: normal')
  })
})

describe('precios y planes', () => {
  it('el precio y el periodo del Plan completo son los de la app', () => {
    expect(FULL_PLAN.price).toBe(PLAN_PRICE)
    expect(FULL_PLAN.period.startsWith(PLAN_PERIOD)).toBe(true)
    expect(FREE_PLAN.price).toBe('MX$0')
  })

  it('lo incluido que el sitio promete coincide con lo que la app dice incluir', () => {
    expect(FREE_PLAN.includes[0]).toBe(FREE_ITEMS[0].replace(/\.$/, ''))
    expect(FULL_ITEMS[0]).toMatch(/^Hasta 10 hijos/)
    expect(FULL_PLAN.includes[0]).toMatch(/^Hasta 10 hijos/)
    expect(FREE_ITEMS.join(' ')).toMatch(/tratamiento activo a la vez/)
    expect(FREE_PLAN.includes).toContain('Un tratamiento activo a la vez')
    expect(FULL_ITEMS.join(' ')).toMatch(/hasta 4 personas/)
  })

  it('el límite de hijos del servidor es el que dice el sitio', () => {
    const service = read('../backend/internal/account/service.go')
    expect(service).toMatch(/freePlanChildLimit = 1\b/)
    expect(service).toMatch(/paidPlanChildLimit = 10\b/)
  })
})
