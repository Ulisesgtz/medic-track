import { describe, expect, it } from 'vitest'
import { MY_DAY, initials } from './myDayText'

// Principio I: «Mi día» records what the person writes; it never suggests, evaluates, praises nor scolds.
const FORBIDDEN = /\bdebes\b|atras|falta|\btoca\b|%|felicid|bien hecho|excelente|alerta|pendiente|urgente|olvid|recomend/i

describe('the words of «Mi día» (Principio I)', () => {
  it('never advises, evaluates or says what is late or missing', () => {
    for (const text of Object.values(MY_DAY)) expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })

  it('draws the initials of the account', () => {
    expect(initials('Ana', 'Morales')).toBe('AM')
    expect(initials('ana', '')).toBe('A')
  })
})
