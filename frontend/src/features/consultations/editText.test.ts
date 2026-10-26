import { describe, expect, it } from 'vitest'
import { EDIT_TEXT, editedLine } from './editText'

function every(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(every)
  return []
}

// Principio I: editing corrects what the parent captured; nothing evaluates the treatment, advises or alarms.
const FORBIDDEN = /\btoca\b|atras|falta|alerta|urgente|recomend|debes|corrige tu|incumpl|\d+\s*%|\brojo\b/i

describe('the words of editing a consultation (Principio I)', () => {
  const sentences = [...every(EDIT_TEXT), editedLine({ at: '2026-10-26T17:05:00Z', by: 'Ana' })]

  it('never evaluates, advises or alarms', () => {
    for (const text of sentences) expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })

  it('says that what was marked stays before a schedule changes', () => {
    expect(EDIT_TEXT.scheduleConfirm.rows.map((r) => r.v).join(' ')).toBe(
      'Las tomas que ya marcaste no cambian. Las que aún no llegan se acomodan al nuevo horario.',
    )
  })
})

describe('editedLine', () => {
  it('says the day and the first name', () => {
    expect(editedLine({ at: '2026-10-26T17:05:00Z', by: 'Ana' })).toMatch(/^Editada el 2[56] oct 2026 por Ana$/)
  })

  it('without a name, only the day; an unreadable date is shown as it came', () => {
    expect(editedLine({ at: '2026-10-26T17:05:00Z', by: '' })).toMatch(/^Editada el 2[56] oct 2026$/)
    expect(editedLine({ at: 'ayer', by: 'Ana' })).toBe('Editada el ayer por Ana')
  })
})
