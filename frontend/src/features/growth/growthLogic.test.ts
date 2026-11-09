import { describe, expect, it } from 'vitest'
import { xMaxFor, yRangeFor } from './chartScale'
import { ageAt, monthsAt } from './growthAge'
import { EMPTY_VALUES, isDirty, parseDecimal, toInput, validate, valuesOf } from './growthForm'
import { GROWTH, authorLine, countLine, lastLine, pointLabel, valuesLine } from './growthText'

describe('growthText — the record never evaluates (Principio I)', () => {
  const all = (value: unknown): string[] =>
    typeof value === 'string'
      ? [value]
      : typeof value === 'function'
        ? [String((value as (...a: unknown[]) => unknown)('weight')), String((value as (...a: unknown[]) => unknown)('female')), String((value as (...a: unknown[]) => unknown)('Mateo'))]
        : []
  const sentences = [
    ...Object.values(GROWTH).flatMap(all),
    lastLine({ measuredOn: '2026-11-03', weightKg: 12.4, heightCm: 86 }),
    authorLine({ createdBy: { name: 'Ana' }, corrected: null }),
    pointLabel('2026-11-03', 'height', 86, '1 año 5 meses'),
  ]
  it.each(['normal', 'bajo', 'alto', 'riesgo', 'sobrepeso', 'desnutri', 'obes', 'por debajo', 'por encima', 'debería', 'debes', 'percentil de', 'preocup', 'alerta'])(
    'no sentence says «%s»',
    (word) => {
      for (const s of sentences) expect(s.toLowerCase()).not.toContain(word)
    },
  )
  it('words the values and who wrote them', () => {
    expect(valuesLine(12.4, null)).toBe('12.4 kg')
    expect(valuesLine(null, 86)).toBe('86 cm')
    expect(valuesLine(12.4, 86)).toBe('12.4 kg · 86 cm')
    expect(lastLine({ measuredOn: '2026-11-03', weightKg: 12.4, heightCm: 86 })).toBe('Última: 12.4 kg · 86 cm, 03 nov 2026')
    expect(authorLine({ createdBy: { name: 'Ana' }, corrected: null })).toBe('Anotada por Ana')
    expect(authorLine({ createdBy: { name: 'Ana' }, corrected: { at: '2026-11-08T18:00:00Z', by: { name: 'Luis' } } })).toBe('Corregida el 08 nov 2026 por Luis')
    expect(countLine(1)).toBe('1 medida')
    expect(countLine(3)).toBe('3 medidas')
    expect(pointLabel('2026-11-03', 'weight', 12.4, '1 año')).toBe('03 nov 2026 · 12.4 kg · 1 año')
    expect(GROWTH.tableIs('female')).toBe('Tabla de la OMS: niña')
    expect(GROWTH.tableIs('male')).toBe('Tabla de la OMS: niño')
    expect(GROWTH.noPoints('height')).toBe('Aún no hay medidas de talla.')
    expect(GROWTH.valueColumn('height')).toBe('Talla')
    expect(GROWTH.tableCaption('height')).toBe('Medidas de talla')
  })
})

describe('growthAge', () => {
  it('days, weeks, months, years', () => {
    expect(ageAt('2024-06-10', '2024-06-13')).toBe('3 días')
    expect(ageAt('2024-06-10', '2024-06-11')).toBe('1 día')
    expect(ageAt('2024-06-10', '2024-07-24')).toBe('6 semanas')
    expect(ageAt('2024-06-10', '2024-06-17')).toBe('1 semana')
    expect(ageAt('2024-06-10', '2025-01-10')).toBe('7 meses')
    expect(ageAt('2024-06-10', '2024-09-10')).toBe('3 meses')
    expect(ageAt('2024-06-10', '2025-07-09')).toBe('12 meses')
    expect(ageAt('2024-06-10', '2026-06-10')).toBe('2 años')
    expect(ageAt('2020-06-10', '2025-11-10')).toBe('5 años 5 meses')
    expect(ageAt('2020-06-10', '2021-07-10')).toBe('13 meses')
    expect(ageAt('2019-06-10', '2021-07-10')).toBe('2 años 1 mes')
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
  it('checks what the server checks', () => {
    expect(validate({ ...ok, measuredOn: '' }, '2024-06-10', '2026-11-08').measuredOn).toBe('Escribe la fecha de la medida.')
    expect(validate({ ...ok, measuredOn: '2026-11-09' }, '2024-06-10', '2026-11-08').measuredOn).toBe('La fecha no puede ser futura.')
    expect(validate({ ...ok, measuredOn: '2024-06-09' }, '2024-06-10', '2026-11-08').measuredOn).toBe('La fecha no puede ser anterior al nacimiento.')
    expect(validate({ ...ok, weight: '', height: '' }, '2024-06-10', '2026-11-08').weightKg).toBe('Escribe el peso, la talla o los dos.')
    expect(validate({ ...ok, weight: '12.345' }, '', '2026-11-08').weightKg).toContain('2 decimales')
    expect(validate({ ...ok, weight: '0.2' }, '', '2026-11-08').weightKg).toContain('0.3')
    expect(validate({ ...ok, height: '86.25' }, '', '2026-11-08').heightCm).toContain('1 decimal')
    expect(validate({ ...ok, height: '300' }, '', '2026-11-08').heightCm).toContain('220')
    expect(validate({ ...ok, note: 'a'.repeat(301) }, '', '2026-11-08').note).toContain('300')
  })
  it('round-trips a saved measurement and knows when something changed', () => {
    const v = valuesOf({ measuredOn: '2026-11-03', weightKg: 12.4, heightCm: null, note: null })
    expect(v).toEqual({ measuredOn: '2026-11-03', weight: '12.4', height: '', note: '' })
    expect(isDirty(v, v)).toBe(false)
    expect(isDirty(v, EMPTY_VALUES)).toBe(true)
    expect(valuesOf({ measuredOn: '2026-11-03', weightKg: null, heightCm: 80, note: 'x' }).height).toBe('80')
  })
})

describe('chartScale', () => {
  const p = (months: number, value = 10) => ({ measuredOn: '2026-01-01', months, value })
  it('shows two years, then whole years past the last point', () => {
    expect(xMaxFor([])).toBe(24)
    expect(xMaxFor([p(5)])).toBe(24)
    expect(xMaxFor([p(23)])).toBe(36)
    expect(xMaxFor([p(70)])).toBe(72)
    expect(xMaxFor([p(71)])).toBe(84)
  })
  it('a tidy value axis around the points and the curves', () => {
    expect(yRangeFor([], [])).toEqual({ min: 0, max: 10, step: 2 })
    const r = yRangeFor([p(1, 8.1), p(2, 10.2)], [{ months: 0, p3: 2.5, p15: 2.9, p50: 3.3, p85: 3.9, p97: 4.3 }])
    expect(r.min).toBeLessThanOrEqual(2.5)
    expect(r.max).toBeGreaterThanOrEqual(10.2)
    const tall = yRangeFor([p(1, 120)], [{ months: 0, p3: 45, p15: 47, p50: 50, p85: 52, p97: 54 }])
    expect(tall.step).toBe(20)
    expect(yRangeFor([p(1, 10)], [])).toEqual({ min: 9.6, max: 10.4, step: 0.2 })
    expect(yRangeFor([p(1, 10), p(2, 13)], []).step).toBe(1)
    expect(yRangeFor([p(1, 10), p(2, 18)], []).step).toBe(2)
  })
})
