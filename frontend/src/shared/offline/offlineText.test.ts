import { describe, expect, it } from 'vitest'
import * as text from './offlineText'

describe('offlineText', () => {
  it('says the hour of today’s data', () => {
    expect(text.bannerText(new Date(2026, 10, 11, 8, 15).getTime(), new Date(2026, 10, 11, 12, 0))).toBe('Sin conexión · datos de las 08:15')
  })

  it('says the day of older data', () => {
    expect(text.bannerText(new Date(2026, 10, 10, 21, 40).getTime(), new Date(2026, 10, 11, 9, 0))).toBe('Sin conexión · datos del 10 nov, 21:40')
    expect(text.bannerText(new Date(2026, 9, 3, 7, 5).getTime(), new Date(2026, 10, 3, 7, 5))).toBe('Sin conexión · datos del 3 oct, 07:05')
  })

  it('never calls anything an error nor talks about the health (Principio I)', () => {
    const all = (Object.values(text) as unknown[])
      .filter((v): v is string => typeof v === 'string')
      .join(' ')
      .toLowerCase()
    for (const word of ['error', 'falló', 'fallo', 'dosis', 'medicamento', 'salud', 'urgente', 'peligro']) {
      expect(all).not.toContain(word)
    }
  })
})
