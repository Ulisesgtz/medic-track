import { describe, expect, it } from 'vitest'
import * as text from './mergeText'

const all = () =>
  JSON.stringify([text.SAME_NAME, text.MERGE_ERROR, text.NOT_NONE, text.mergeWarning('Ana'), text.FIELD_LABELS, text.COUNT_LABELS, text.sideLabel('own'), text.sideLabel('family')])

describe('mergeText', () => {
  it('has the fixed texts', () => {
    expect(text.SAME_NAME).toBe('Se llaman igual')
    expect(text.MERGE_ERROR).toBe('No se pudo unir. No cambió nada.')
    expect(text.mergeWarning('Ana')).toBe(
      'Todo pasa a la familia de Ana. Si después sales de la familia, no te llevas copia. Esto no se puede deshacer.',
    )
  })

  it('never judges, recommends or congratulates', () => {
    for (const bad of ['correcto', 'el bueno', 'recomend', 'felicidades', 'parece el mismo', 'mejor', 'más reciente']) {
      expect(all().toLowerCase()).not.toContain(bad)
    }
  })

  it('writes counts in singular and plural, skipping zeros', () => {
    expect(text.countText('consultations', 1)).toBe('1 consulta')
    expect(text.countText('consultations', 2)).toBe('2 consultas')
    expect(text.countsSummary({ consultations: 2, vaccines: 0, cardPhotos: 1 })).toBe('2 consultas · 1 foto de la cartilla')
    expect(text.countsSummary({})).toBe('')
  })

  it('uses no red or amber classes in the folder', () => {
    const files = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const sources = Object.entries(files).filter(([path]) => !path.includes('.test.'))
    expect(sources.length).toBeGreaterThan(3)
    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(/\b(?:text|bg|border|ring)-(?:red|amber|orange|yellow|error|pending)/)
    }
  })
})
