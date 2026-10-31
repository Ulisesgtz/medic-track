import { describe, expect, it } from 'vitest'
import { DOC, PANEL } from './exportText'

/** Every sentence of an object of texts: strings as they are, functions called with sample values. */
function every(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [String(value(3, 18, 'Mateo'))]
  if (value && typeof value === 'object') return Object.values(value).flatMap(every)
  return []
}

// Principio I (FR-019): the PDF and its panel record what the family captured and how much; they never evaluate, advise or alarm.
const FORBIDDEN =
  /\btoca\b|\btocan\b|atras|falta|complet|alerta|urgente|recomend|\bdebe|sem[aá]foro|\brojo\b|pendiente|vencid|cumplimiento|%/i

describe('the words of «Exportar a PDF» (Principio I)', () => {
  const sentences = [...every(PANEL), ...every(DOC)]

  it('never evaluates, advises or alarms', () => {
    for (const text of sentences) {
      const plain = text.normalize('NFD').replace(/\p{M}/gu, '')
      // «Plan completo» names the plan, it doesn't judge the record.
      expect(plain.replace(/plan completo/gi, ''), text).not.toMatch(FORBIDDEN)
    }
  })

  it('every page says that what is shown is what the family captured', () => {
    expect(DOC.footerNote).toBe('Lo registrado es lo que la familia capturó. No sustituye el expediente ni el criterio de tu médico.')
  })

  it('writes the mock’s sentences with their numbers', () => {
    expect(DOC.footerGenerated('24 oct 2026', 1, 5)).toBe('Generado con PediTrack el 24 oct 2026 · Página 1 de 5')
    expect(DOC.pages(2, 3)).toBe('p. 2–3')
    expect(DOC.pages(4, 4)).toBe('p. 4')
    expect(DOC.heightValue(112)).toBe('112 cm')
    expect(DOC.weightValue(19.4)).toBe('19.4 kg')
    expect(DOC.weightValue(19.444)).toBe('19.4 kg')
    expect(DOC.continuesOn(3)).toBe('Continúa en la página 3')
    expect(DOC.correctedOn('3 oct', 'Ana')).toBe('Corregida el 3 oct por Ana')
    expect(DOC.correctedOn('3 oct', null)).toBe('Corregida el 3 oct')
    expect(PANEL.privacy('Mateo')).toBe('Este PDF contiene datos de salud de Mateo. Compártelo solo con quien lo necesite.')
    expect(PANEL.readyMeta(5, '1.2 MB', 'del 1 ene al 24 oct 2026')).toBe('5 páginas · 1.2 MB · del 1 ene al 24 oct 2026')
    expect(PANEL.readyMeta(1, '80 KB', 'todo el historial')).toBe('1 página · 80 KB · todo el historial')
  })
})
