import { describe, expect, it } from 'vitest'
import { deleteCopy } from './deleteCopy'

const all = [deleteCopy('supplement', false), deleteCopy('supplement', true), deleteCopy('activity', false), deleteCopy('activity', true)]

const sentences = (c: ReturnType<typeof deleteCopy>) => [
  c.button,
  c.title('Zinc'),
  ...c.rows.flatMap((r) => [r.k, r.v]),
  c.confirm,
  c.busy,
  c.hasMarks,
  c.failed,
  c.tutorNote(true),
  c.tutorNote(false),
]

describe('deleteCopy', () => {
  it('never judges: no evaluating or alarming words (Principio I)', () => {
    for (const c of all) {
      for (const s of sentences(c)) {
        expect(s).not.toMatch(/error|equivoc|olvid|incumpl|debes|deberías|cuidado|peligro|riesgo|urgente|mal\b/i)
      }
    }
  })

  it('says it cannot be undone and offers finishing to keep the record', () => {
    for (const c of all) {
      expect(c.rows.map((r) => r.v).join(' ')).toContain('No se puede deshacer.')
      expect(c.rows[2].v).toMatch(/«Finalizar (suplemento|actividad)»/)
    }
  })

  it('names the family only when it is not the person’s own', () => {
    expect(deleteCopy('supplement', false).rows[0].v).toBe('El suplemento, todas sus tomas y sus avisos, para todas las personas de la familia.')
    expect(deleteCopy('activity', true).rows[0].v).toBe('La actividad, todos sus horarios y sus avisos.')
    expect(deleteCopy('activity', false).button).toBe('Eliminar actividad')
    expect(deleteCopy('supplement', true).title('Omega 3')).toBe('¿Eliminar Omega 3?')
  })

  it('tells a Caregiver a Tutor can delete it only while nothing is marked', () => {
    expect(deleteCopy('supplement', false).tutorNote(true)).toBe('Un Tutor puede pausar, editar, finalizar o eliminar este suplemento.')
    expect(deleteCopy('activity', false).tutorNote(false)).toBe('Un Tutor puede pausar, editar o finalizar esta actividad.')
  })
})
