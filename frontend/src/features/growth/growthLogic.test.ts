import { describe, expect, it } from 'vitest'
import { ageAt, monthsAt } from './growthAge'
import { EMPTY_VALUES, isDirty, parseDecimal, toInput, validate, valuesOf } from './growthForm'
import {
  GROWTH,
  byLine,
  cmText,
  correctedLine,
  countLine,
  kgText,
  lastLine,
  latestWhen,
  noteLine,
  readingLine,
  readingMeta,
  sinceLine,
  valueText,
  valuesLine,
} from './growthText'

describe('growthText — the record never evaluates (Principio I)', () => {
  const all = (value: unknown): string[] => {
    if (typeof value === 'string') return [value]
    if (typeof value !== 'function') return []
    const fn = value as (...a: unknown[]) => unknown
    return [String(fn('weight', 'Mateo')), String(fn('height', 'Ana')), String(fn('female', 'Ana')), String(fn('male', null)), String(fn('Mateo', null))]
  }
  const sentences = [
    ...Object.values(GROWTH).flatMap(all),
    lastLine({ measuredOn: '2026-11-03', weightKg: 12.4, heightCm: 86 }),
    latestWhen('2026-10-24', '2026-10-12'),
    byLine('Ana'),
    correctedLine({ at: '2026-10-03T10:00:00Z', by: { name: 'Luis' } }),
    readingLine('2026-10-12', 'weight', 11.4, '2 años 1 mes'),
  ]
  it.each(['normal', 'bajo', 'alto', 'riesgo', 'sobrepeso', 'desnutri', 'obes', 'por debajo', 'por encima', 'debería', 'debes', 'percentil de', 'preocup', 'alerta', 'tarde'])(
    'no sentence says «%s»',
    (word) => {
      for (const s of sentences) expect(s.toLowerCase()).not.toContain(word)
    },
  )

  it('words the values as the mock', () => {
    expect(kgText(9)).toBe('9.0 kg')
    expect(kgText(11.4)).toBe('11.4 kg')
    expect(kgText(11.45)).toBe('11.45 kg')
    expect(cmText(82)).toBe('82 cm')
    expect(cmText(59.5)).toBe('59.5 cm')
    expect(valueText('weight', 4.4)).toBe('4.4 kg')
    expect(valueText('height', 54)).toBe('54 cm')
    expect(valuesLine(11.4, 82)).toBe('11.4 kg · 82 cm')
    expect(valuesLine(9, null)).toBe('9.0 kg')
    expect(valuesLine(null, 74.5)).toBe('74.5 cm')
    expect(lastLine({ measuredOn: '2026-11-03', weightKg: 12.4, heightCm: 86 })).toBe('Última: 12.4 kg · 86 cm, 03 nov 2026')
    expect(countLine(1)).toBe('1 medida')
    expect(countLine(8)).toBe('8 medidas')
    expect(byLine('Ana')).toBe('Anotada por Ana')
    expect(correctedLine({ at: '2026-10-03T10:00:00Z', by: { name: 'Luis' } })).toBe('Corregida el 3 oct 2026 por Luis')
    expect(noteLine('Con ropa ligera')).toBe('Nota: Con ropa ligera')
    expect(readingLine('2026-10-12', 'weight', 11.4, '2 años 1 mes')).toBe('12 oct 2026 · 11.4 kg · 2 años 1 mes')
    expect(readingMeta('2026-10-12', '2 años 1 mes')).toBe('12 oct 2026 · 2 años 1 mes')
    expect(GROWTH.chartName('height', 'Mateo')).toBe('Gráfica de talla de Mateo. Los mismos datos están en Medidas anotadas.')
    expect(GROWTH.tableChosenBy('male', 'Ana')).toBe('Curvas de la OMS para niño. La tabla la elige Ana.')
    expect(GROWTH.tableChosenBy('female', null)).toBe('Curvas de la OMS para niña. La tabla la elige la familia.')
    expect(GROWTH.inviteReadOnly('Mateo', 'Ana')).toContain('La tabla de la OMS la elige Ana.')
    expect(GROWTH.noPoints('height')).toBe('Aún no hay medidas de talla.')
    expect(GROWTH.noPoints('weight')).toBe('Aún no hay medidas de peso.')
  })

  it('says how long ago, and only that', () => {
    expect(sinceLine('2026-10-24', '2026-10-24')).toBe('hoy')
    expect(sinceLine('2026-10-24', '2026-10-23')).toBe('ayer')
    expect(sinceLine('2026-10-24', '2026-10-12')).toBe('hace 12 días')
    expect(sinceLine('2026-10-24', '2026-09-24')).toBe('hace 30 días')
    expect(sinceLine('2026-10-24', '2026-09-20')).toBe('hace 1 mes')
    expect(sinceLine('2026-10-24', '2026-07-10')).toBe('hace 3 meses')
    expect(sinceLine('2026-10-24', '2025-10-01')).toBe('hace 1 año')
    expect(sinceLine('2026-10-24', '2023-10-01')).toBe('hace 3 años')
    expect(sinceLine('2026-10-24', '2026-10-30')).toBe('hoy')
    expect(latestWhen('2026-10-24', '2026-10-12')).toBe('hace 12 días · 12 oct 2026')
  })
})

describe('growthAge', () => {
  it('weeks, months and then years from twelve months (the mock)', () => {
    expect(ageAt('2024-06-10', '2024-06-13')).toBe('3 días')
    expect(ageAt('2024-06-10', '2024-06-11')).toBe('1 día')
    expect(ageAt('2024-06-10', '2024-07-24')).toBe('6 semanas')
    expect(ageAt('2024-06-10', '2024-06-17')).toBe('1 semana')
    expect(ageAt('2024-06-10', '2025-01-10')).toBe('7 meses')
    expect(ageAt('2024-06-10', '2024-09-10')).toBe('3 meses')
    expect(ageAt('2024-06-10', '2025-07-09')).toBe('1 año')
    expect(ageAt('2024-06-10', '2026-06-10')).toBe('2 años')
    expect(ageAt('2020-06-10', '2025-11-10')).toBe('5 años 5 meses')
    expect(ageAt('2020-06-10', '2021-07-10')).toBe('1 año 1 mes')
    expect(ageAt('2024-09-12', '2026-04-10')).toBe('1 año 6 meses')
    expect(ageAt('2024-06-10', '2024-06-01')).toBe('0 días')
  })
  it('months as the WHO counts them', () => {
    expect(monthsAt('2024-06-10', '2024-06-10')).toBe(0)
    expect(monthsAt('2025-06-10', '2026-06-10')).toBeCloseTo(11.99, 2)
  })
})

describe('growthForm', () => {
  const ok = { measuredOn: '2026-11-03', weight: '12,4', height: '86', note: ' tos ' }
  it('accepts a comma or a point and sends numbers', () => {
    expect(validate(ok, '2024-06-10', '2026-11-08')).toEqual({})
    expect(toInput(ok)).toEqual({ measuredOn: '2026-11-03', weightKg: 12.4, heightCm: 86, note: 'tos' })
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('1.2.3')).toBeNaN()
  })
  it('checks what the server checks, with the mock’s words', () => {
    const v = (patch: Partial<typeof ok>, birth = '2024-06-10') => validate({ ...ok, ...patch }, birth, '2026-11-08')
    expect(v({ measuredOn: '' }).measuredOn).toBe('Escribe la fecha de la medida.')
    expect(v({ measuredOn: '2026-11-09' }).measuredOn).toBe('Esa fecha aún no llega. Elige hoy o un día anterior.')
    expect(v({ measuredOn: '2024-06-09' }).measuredOn).toBe('Esa fecha es antes del nacimiento. Elige otra.')
    expect(v({ weight: '', height: '' }).weightKg).toBe('Escribe el peso, la talla o los dos.')
    expect(v({ weight: 'once' }).weightKg).toBe('Escribe el peso en kilos, con punto decimal. Por ejemplo: 11.6')
    expect(v({ height: 'ochenta' }).heightCm).toBe('Escribe la talla en centímetros. Por ejemplo: 83')
    expect(v({ weight: '12.345' }, '').weightKg).toContain('2 decimales')
    expect(v({ weight: '0.2' }, '').weightKg).toContain('0.3')
    expect(v({ height: '86.25' }, '').heightCm).toContain('1 decimal')
    expect(v({ height: '300' }, '').heightCm).toContain('220')
    expect(v({ note: 'a'.repeat(301) }, '').note).toContain('300')
  })
  it('round-trips a saved measurement and knows when something changed', () => {
    const value = valuesOf({ measuredOn: '2026-11-03', weightKg: 12.4, heightCm: null, note: null })
    expect(value).toEqual({ measuredOn: '2026-11-03', weight: '12.4', height: '', note: '' })
    expect(isDirty(value, value)).toBe(false)
    expect(isDirty(value, EMPTY_VALUES)).toBe(true)
    expect(valuesOf({ measuredOn: '2026-11-03', weightKg: null, heightCm: 80, note: 'x' }).height).toBe('80')
  })
})
