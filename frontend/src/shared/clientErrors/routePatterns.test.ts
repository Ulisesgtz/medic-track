import { describe, expect, it } from 'vitest'
import appSource from '../../App.tsx?raw'
import { OTHER_ROUTE, ROUTE_PATTERNS, routePattern } from './routePatterns'

describe('routePattern', () => {
  it('turns an address with ids into its pattern', () => {
    expect(routePattern('/children/3e34a679-9b24-4c1d-8a5e-0123456789ab')).toBe(
      '/children/:childId',
    )
    expect(routePattern('/consultations/abc/editar')).toBe('/consultations/:consultationId/editar')
    expect(routePattern('/children/c1/crecimiento/m1/editar')).toBe(
      '/children/:childId/crecimiento/:measurementId/editar',
    )
  })

  it('keeps fixed screens as they are and prefers the fixed one over the parameter', () => {
    expect(routePattern('/hijo/hoy')).toBe('/hijo/hoy')
    expect(routePattern('/botiquin/nuevo')).toBe('/botiquin/nuevo')
    expect(routePattern('/botiquin/abc')).toBe('/botiquin/:itemId')
    expect(routePattern('/')).toBe('/')
    expect(routePattern('/home/')).toBe('/home')
  })

  it('says `other` for anything that is not a screen of the app', () => {
    expect(routePattern('/no-existe/ana-lopez')).toBe(OTHER_ROUTE)
  })

  it('never leaves a digit in a pattern (the server refuses them)', () => {
    for (const pattern of ROUTE_PATTERNS) expect(pattern).not.toMatch(/\d/)
  })

  it('lists exactly the paths of App.tsx (minus the catch-all)', () => {
    const inApp = [...appSource.matchAll(/path="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((p) => p !== '*')
    expect([...ROUTE_PATTERNS].sort()).toEqual([...new Set(inApp)].sort())
  })
})
