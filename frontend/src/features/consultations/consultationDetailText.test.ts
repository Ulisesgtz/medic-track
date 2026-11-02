import { describe, expect, it } from 'vitest'
import {
  DETAIL,
  dataSummary,
  dayTitle,
  finished,
  inProgress,
  scheduleLine,
  takenLine,
  toMarkChip,
  unregisteredChip,
} from './consultationDetailText'

// Principio I: the detail says what was registered; it never says what is due, late or missing, never praises nor scolds.
const FORBIDDEN = /\bdebes\b|atras|falta|\btoca\b|\btocan\b|%|felicid|bien hecho|excelente|\bcuidado\b|alerta|no tomada|pendiente|urgente|olvid/i

describe('the words of the consultation detail (Principio I)', () => {
  it('never advises, evaluates, praises or says what is late or missing', () => {
    const sentences = [
      ...Object.values(DETAIL),
      inProgress('4 nov'),
      finished('21 oct'),
      toMarkChip(2),
      unregisteredChip(1),
      dayTitle(true, ''),
      dayTitle(false, '20 de octubre'),
      dataSummary(true, 3, true),
      scheduleLine(8, 7, '07:00'),
    ]
    for (const text of sentences) expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })
})

describe('the lines', () => {
  it('says the schedule as the design does', () => {
    expect(scheduleLine(8, 7, '07:00')).toBe('c/8 h · 7 días · primera toma 07:00')
    expect(scheduleLine(24, 1, null)).toBe('c/24 h · 1 día')
  })

  it('folds the data into one line', () => {
    expect(dataSummary(true, 3, true)).toBe('Foto · 3 síntomas · notas')
    expect(dataSummary(false, 1, false)).toBe('Sin foto · 1 síntoma')
  })

  it('titles the chosen day', () => {
    expect(dayTitle(true, '22 de octubre')).toBe('Tomas de hoy')
    expect(dayTitle(false, '20 de octubre')).toBe('Tomas del 20 de octubre')
  })

  it('says when and who marked a dose', () => {
    expect(takenLine({ name: 'Ana', at: new Date(2026, 9, 22, 7, 5).toISOString() }, '')).toBe('✓ 07:05 · por Ana')
    expect(takenLine(null, new Date(2026, 9, 22, 8, 0).toISOString())).toBe('✓ 08:00')
  })
})
