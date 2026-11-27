import { describe, expect, it } from 'vitest'
import type { OcrWord } from '../consultations/useOcrSuggestion'
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

// bugfix/081: the name is proposed only with clear evidence (biggest legible letters, or a name the family already wrote).
const w = (text: string, height: number, line: number, confidence = 90): OcrWord => ({ text, height, line, confidence })

describe('parseMedicineText name rules (bugfix/081)', () => {
  const box = 'LABORATORIOS FARMACEUTICOS DE MEXICO\nTEMPRA FORTE\nParacetamol 500 mg\nCAD 03/2027'
  const boxWords = [
    w('LABORATORIOS', 20, 0), w('FARMACEUTICOS', 20, 0), w('DE', 20, 0), w('MEXICO', 20, 0),
    w('TEMPRA', 62, 1), w('FORTE', 58, 1),
    w('Paracetamol', 22, 2), w('500', 22, 2), w('mg', 22, 2),
    w('CAD', 18, 3), w('03/2027', 18, 3),
  ]

  it('the biggest legible letters win over a longer line of the laboratory', () => {
    expect(parseMedicineText(box, { words: boxWords })).toEqual({ name: 'Tempra Forte', strength: '500 mg', expires: { year: 2027, month: 3, day: null } })
  })

  it('joins only the words of that line with a similar size', () => {
    const words = [...boxWords.filter((x) => x.line !== 1), w('TEMPRA', 62, 1), w('Forte', 30, 1)]
    expect(parseMedicineText(box, { words }).name).toBe('Tempra')
  })

  it('proposes no name when no word stands out, is legible or is made of letters', () => {
    const same = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Omega'].map((t, i) => w(t, 30, i))
    expect(parseMedicineText('Alfa Beta Gamma Delta Omega', { words: same }).name).toBeUndefined()
    const blurry = [w('TEMPRA', 70, 0, 40), w('uno', 20, 1), w('dos', 20, 2), w('tres', 20, 3)]
    expect(parseMedicineText('TEMPRA uno dos tres', { words: blurry }).name).toBeUndefined()
    const noise = [w('Il', 90, 0), w('x7#%', 80, 0), w('a1b2c3d', 85, 1), w('LOTE', 90, 2), w('TABLETAS', 90, 2), w('con', 90, 3), w('mg', 90, 3)]
    expect(parseMedicineText('Il x7#% a1b2c3d LOTE TABLETAS con mg', { words: noise }).name).toBeUndefined()
    expect(parseMedicineText('Zinc 20 mg', { words: [w('Zinc', 40, 0), w('20', 40, 0), w('mg', 40, 0)] }).name).toBe('Zinc')
    expect(parseMedicineText('CAD 03/2027 Vence', { words: [w('CAD', 50, 0), w('Vence', 50, 0)] }).name).toBeUndefined()
  })

  it('symbols at the edges of a word are trimmed', () => {
    const words = [w('Vitamina®', 50, 0), w('D3', 50, 0), w('a', 10, 1), w('b', 10, 1), w('c', 10, 1), w('d', 10, 1)]
    expect(parseMedicineText('Vitamina® D3', { words }).name).toBe('Vitamina')
  })

  it('a known name wins, tolerating a reading error, and comes back as it was saved', () => {
    const words = [w('LABORATORIO', 20, 0), w('Tenpra', 60, 1, 80), w('otro', 20, 2), w('texto', 20, 2), w('mas', 20, 3)]
    expect(parseMedicineText('LABORATORIO\nTenpra', { words, known: ['Tempra Infantil', 'tempra'] }).name).toBe('tempra')
    // It wins over the biggest letters even when those are another word.
    expect(parseMedicineText('GRANDE\nTempra', { words: [w('GRANDE', 90, 0), w('Tempra', 20, 1), w('x', 20, 2), w('y', 20, 2), w('z', 20, 3)], known: ['Tempra'] }).name).toBe('Tempra')
  })

  it('compares without case or accents, by whole name, by every word and by closeness', () => {
    expect(parseMedicineText('IBUPROFÉNO', { known: ['Ibuprofeno'] }).name).toBe('Ibuprofeno')
    expect(parseMedicineText('Paracetamol\nlote\nInfantil', { known: ['Paracetamol infantil'] }).name).toBe('Paracetamol infantil')
    expect(parseMedicineText('PARACETAMOL INFANTIL', { known: ['Paracetamol Infantil'] }).name).toBe('Paracetamol Infantil')
    expect(parseMedicineText('Ibuprofenc', { known: ['Ibuprofeno'] }).name).toBe('Ibuprofeno')
    // Too different, too short, or two edits on a short name: not the same (the rules without a known name apply).
    expect(parseMedicineText('Amoxicilina', { known: ['Ibuprofeno'] }).name).toBe('Amoxicilina')
    expect(parseMedicineText('Zinc\nCAD 03/2027', { known: ['Zin', ' '] }).name).toBe('Zinc')
    expect(parseMedicineText('Tenpro\nCAD 03/2027', { known: ['Tempra'] }).name).toBe('Tenpro')
    expect(parseMedicineText('Tenpra', { known: ['Tempra'] }).name).toBe('Tempra')
  })

  it('the closest known name wins, then the longest', () => {
    expect(parseMedicineText('Tempra Forte', { known: ['Tempra', 'Tempra Forte'] }).name).toBe('Tempra Forte')
    expect(parseMedicineText('Tenpra', { known: ['Tempro', 'Tempra'] }).name).toBe('Tempra')
  })

  it('without per-word data: only one clean line, or the single UPPERCASE one, else nothing', () => {
    expect(parseMedicineText('Amoxicilina\nsuspension\n250 mg').name).toBe('Amoxicilina')
    expect(parseMedicineText('Laboratorios Pisa\nAMOXICILINA\nCAD 03/2027').name).toBe('Amoxicilina')
    expect(parseMedicineText('Laboratorios Pisa\nAmoxicilina forte').name).toBeUndefined()
    expect(parseMedicineText('AMOXICILINA\nLABORATORIOS PISA').name).toBeUndefined()
    expect(parseMedicineText('i ll |  — ; .\nxx 7 4\n- . ,').name).toBeUndefined()
    expect(parseMedicineText('Una caja con muchas palabras sueltas aqui').name).toBeUndefined()
    expect(parseMedicineText('Zinc', { words: [] }).name).toBe('Zinc')
  })
})
