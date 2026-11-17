import { describe, expect, it } from 'vitest'
import { telHref } from './callLink'
import { FORM, RECORD, bloodLabel, conflictBody, conflictTitle, countOf, itemLegend, itemWord, limitNote, moreLine, tooLong, updatedLine } from './recordText'

// specs/073: the record is shown as written and never compared, warned about or graded (Principio I).

const FORBIDDEN = /riesgo|peligro|grave|urgente|sin alergias|sin padecimientos|alerta|cuidado|debes|recomend|normal/i

function sentences(): string[] {
  const own = [...Object.values(RECORD), ...Object.values(FORM)].flatMap((v) => (typeof v === 'string' ? [v] : typeof v === 'object' ? Object.values(v) : []))
  return [
    ...own,
    RECORD.callTo('Dra. Ruiz'),
    RECORD.callTo(null),
    FORM.seeAll(30),
    updatedLine('2026-11-17T18:05:00Z', 'Ana'),
    bloodLabel('unknown'),
    countOf(2, 30),
    limitNote('allergy', 30),
    limitNote('condition', 30),
    moreLine('allergy', 28),
    moreLine('condition', 1),
    itemLegend('allergy', 1),
    tooLong(120),
    conflictTitle('Rafael'),
    conflictTitle(null),
    conflictBody('Rafael', '2026-11-17T16:42:00Z'),
    conflictBody(null, null),
  ]
}

describe('the record wording', () => {
  it('has no word that evaluates, warns or claims an absence', () => {
    for (const text of sentences()) expect(text, text).not.toMatch(FORBIDDEN)
  })

  it('the fixed sentence and the neutral kinds', () => {
    expect(RECORD.phrase).toBe('Lo anotado es lo que la familia escribió y no sustituye la opinión de su médico.')
    expect(Object.values(RECORD.kinds)).toEqual(['Medicamento', 'Alimento', 'Otra'])
  })

  it('formats the pieces', () => {
    expect(updatedLine('2026-11-17T18:05:00Z', 'Ana')).toMatch(/^Actualizada el 1[67] nov 2026 por Ana$/)
    expect(updatedLine('2026-11-17T18:05:00Z', null)).not.toContain(' por ')
    expect(bloodLabel('AB-')).toBe('AB−')
    expect(bloodLabel('O+')).toBe('O+')
    expect(bloodLabel('unknown')).toBe('No lo sé')
    expect(moreLine('allergy', 1)).toBe('y 1 alergia más')
    expect(moreLine('condition', 28)).toBe('y 28 padecimientos más')
    expect(itemWord('condition')).toBe('padecimiento')
    expect(itemLegend('condition', 2)).toBe('Padecimiento 2')
    expect(conflictTitle(null)).toBe('Otra persona guardó cambios en la ficha')
    expect(conflictBody('Rafael', null)).toBe('Lo que escribiste sigue aquí. Si guardas ahora, tus cambios reemplazan los de Rafael.')
  })
})

describe('callLink', () => {
  it('keeps digits and a leading +', () => {
    expect(telHref('+52 (33) 1234-5678')).toBe('tel:+523312345678')
    expect(telHref('33 1234 5678')).toBe('tel:3312345678')
    expect(telHref('  ')).toBeNull()
    expect(telHref('abc')).toBeNull()
    expect(telHref(null)).toBeNull()
  })
})

describe('no alarm colors in the feature', () => {
  it('never uses red or amber classes; the error token only in the form', () => {
    const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    for (const [path, code] of Object.entries(sources).filter(([p]) => !p.includes('.test.'))) {
      const file = path.replace('./', '')
      expect(code, file).not.toMatch(/(?:text|bg|border|ring)-(?:red|amber|orange|yellow|rose|pending)/)
      if (!['RecordFormParts.tsx', 'EditChildRecordPage.tsx'].includes(file)) expect(code, file).not.toMatch(/(?:text|bg|border)-error/)
    }
  })
})
