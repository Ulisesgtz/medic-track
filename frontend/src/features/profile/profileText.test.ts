import { describe, expect, it } from 'vitest'
import { PROFILE, backTo, sharedEntry } from './profileText'

// Principio I: the profile says what the app records and who sees it; it never evaluates a consultation, a dose or a person.
const FORBIDDEN = /\bdebes\b|deber[ií]as|atras|falta|\btoca\b|%|felicid|bien hecho|excelente|\bcuidado\b|alerta|riesgo|recomend|no tomada|urgente|olvid/i

describe('the words of the profile (Principio I)', () => {
  const sentences = [...Object.values(PROFILE), backTo('Ana'), sharedEntry('Ana')]

  it('never evaluate nor advise', () => {
    for (const s of sentences) expect(s).not.toMatch(FORBIDDEN)
  })

  it('say who sees the consultations', () => {
    expect(PROFILE.shareOn).toContain('Cuidadores nunca')
    expect(PROFILE.shareOff).toContain('Solo tú')
    expect(backTo('Ana')).toBe('← Ana')
    expect(sharedEntry('Ana')).toBe('Consultas de Ana')
  })
})
