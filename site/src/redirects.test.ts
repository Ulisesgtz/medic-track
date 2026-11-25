import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ROUTES } from '../scripts/seo-files.ts'
import { PAGES } from './pages.ts'

// Cada ruta de la app (frontend/src/App.tsx) debe estar en _redirects hacia app.pedi-track.com, salvo «/» y «/planes», que son
// del sitio (contracts/rutas.md). Si alguien agrega una ruta a la app y no aquí, o crea una página del sitio con la dirección de
// una de la app, esta prueba falla.

const APP = readFileSync(resolve(process.cwd(), '../frontend/src/App.tsx'), 'utf8')

/** Las rutas que la app declara, sin las de prueba (`/__prueba-error…`) ni el comodín de «no encontrada». */
function appRoutes(): string[] {
  const found = [...APP.matchAll(/path="([^"]+)"/g)].map((match) => match[1])
  return [...new Set(found)].filter((path) => path !== '*' && !path.includes('__prueba'))
}

/** Un camino concreto de una ruta con parámetros: `/children/:childId/editar` → `/children/x/editar`. */
const sample = (route: string) => route.replace(/:[A-Za-z]+/g, 'x')

function redirected(path: string): boolean {
  return APP_ROUTES.some((rule) => (rule.endsWith('/*') ? path.startsWith(`${rule.slice(0, -2)}/`) : rule === path))
}

describe('redirecciones a la app', () => {
  it('lee las rutas de la app', () => {
    const routes = appRoutes()
    expect(routes.length).toBeGreaterThan(40)
    expect(routes).toContain('/signup')
    expect(routes).toContain('/planes/regreso')
  })

  it('toda ruta de la app, salvo «/» y «/planes», se redirige', () => {
    const missing = appRoutes()
      .filter((route) => route !== '/' && route !== '/planes')
      .filter((route) => !redirected(sample(route)))
    expect(missing).toEqual([])
  })

  it('«/» y «/planes» no se redirigen: son del sitio', () => {
    expect(redirected('/')).toBe(false)
    expect(redirected('/planes')).toBe(false)
  })

  it('ninguna página del sitio choca con una redirección a la app', () => {
    const clashes = PAGES.map((page) => page.path).filter((path) => redirected(path))
    expect(clashes).toEqual([])
    for (const rule of APP_ROUTES) expect(PAGES.some((page) => page.path === rule)).toBe(false)
  })

  it('las reglas tienen sentido: empiezan con barra y no se repiten', () => {
    expect(new Set(APP_ROUTES).size).toBe(APP_ROUTES.length)
    for (const rule of APP_ROUTES) expect(rule.startsWith('/')).toBe(true)
  })
})
