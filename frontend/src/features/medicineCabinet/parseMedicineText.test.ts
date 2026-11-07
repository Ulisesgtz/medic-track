import { describe, expect, it } from 'vitest'
import { parseMedicineText } from './parseMedicineText'

describe('parseMedicineText (specs/062 R4)', () => {
  it('reads a children’s paracetamol box', () => {
    const text = 'PARACETAMOL INFANTIL\nSuspensión\n160 mg/5 ml\nFrasco con 120 ml\nLote 23A1\nCAD: 03/2027'
    expect(parseMedicineText(text)).toEqual({ name: 'Paracetamol Infantil', strength: '160 mg/5 ml', expires: { year: 2027, month: 3, day: null } })
  })

  it('understands the usual date shapes after CAD, EXP or Vence, and none without them', () => {
    expect(parseMedicineText('Ibuprofeno\nEXP 12/08/2026').expires).toEqual({ year: 2026, month: 8, day: 12 })
    expect(parseMedicineText('Loratadina\nCad. ENE 2028').expires).toEqual({ year: 2028, month: 1, day: null })
    expect(parseMedicineText('Suero oral\nVence: 3 sep 2027').expires).toEqual({ year: 2027, month: 9, day: 3 })
    expect(parseMedicineText('Zinc\nCaducidad 2027-06').expires).toEqual({ year: 2027, month: 6, day: null })
    expect(parseMedicineText('Zinc\nEXP 11-26').expires).toEqual({ year: 2026, month: 11, day: null })
    expect(parseMedicineText('Zinc\nEXP JUN/27').expires).toEqual({ year: 2027, month: 6, day: null })
    expect(parseMedicineText('Amoxicilina\n03/2027').expires).toBeUndefined()
    expect(parseMedicineText('Amoxicilina\nCAD 31/02/2027').expires).toBeUndefined()
    expect(parseMedicineText('Amoxicilina\nCAD 13/2027').expires).toBeUndefined()
    expect(parseMedicineText('Amoxicilina\nCAD pronto').expires).toBeUndefined()
    // A word that only starts like one (expectorante) neither hides the real date nor is taken for packaging.
    expect(parseMedicineText('AMBROXOL EXPECTORANTE\nJarabe\nCAD 03/2027')).toEqual({
      name: 'Ambroxol Expectorante',
      expires: { year: 2027, month: 3, day: null },
    })
    expect(parseMedicineText('Zinc\nEXP lote 7\nCAD 05/2028').expires).toEqual({ year: 2028, month: 5, day: null })
  })

  it('reads the strength with its units', () => {
    expect(parseMedicineText('Paracetamol 500mg tabletas').strength).toBe('500 mg')
    expect(parseMedicineText('Vitamina D 400 UI').strength).toBe('400 UI')
    expect(parseMedicineText('Amoxicilina 250 MG / 5 ML').strength).toBe('250 mg/5 ml')
    expect(parseMedicineText('Pomada de óxido de zinc').strength).toBeUndefined()
  })

  it('takes the name from the first lines, never packaging words, and proposes nothing from empty text', () => {
    expect(parseMedicineText('Tabletas\nContiene 20\nAMOXICILINA').name).toBe('Amoxicilina')
    expect(parseMedicineText('123 456\n!!').name).toBeUndefined()
    expect(parseMedicineText('')).toEqual({})
    expect(parseMedicineText(null)).toEqual({})
    expect(parseMedicineText('x'.repeat(5) + 'A'.repeat(200)).name?.length).toBe(120)
  })
})
