import { describe, expect, it } from 'vitest'
import { OTHER } from './vaccineForm'
import { parseVaccineText } from './parseVaccineText'

const CATALOG = [
  { code: 'hepatitis_b', name: 'Hepatitis B' },
  { code: 'bcg', name: 'BCG' },
  { code: 'mmr', name: 'Triple viral (SRP)' },
  { code: 'pneumococcal', name: 'Neumocócica' },
  { code: 'hepatitis_a', name: 'Hepatitis A' },
]
const BIRTH = '2023-01-10'
const TODAY = '2026-10-21'
const parse = (text: string) => parseVaccineText(text, CATALOG, BIRTH, TODAY)
const strip = (rows: ReturnType<typeof parse>) => rows.map((r) => ({ vaccine: r.vaccine, customName: r.customName, appliedOn: r.appliedOn, doseNumber: r.doseNumber }))

describe('parseVaccineText', () => {
  it('finds a catalog vaccine and a numeric date', () => {
    expect(strip(parse('Hepatitis B 14/03/2023'))).toEqual([{ vaccine: 'hepatitis_b', customName: '', appliedOn: '2023-03-14', doseNumber: '' }])
  })

  it('reads dd-mm-aa, dd.mm.aaaa and two-digit years', () => {
    const rows = strip(parse('BCG 15-01-23\nHepatitis B 02.03.2023'))
    expect(rows.map((r) => r.appliedOn)).toEqual(['2023-01-15', '2023-03-02'])
  })

  it('reads dates with Spanish month names, abbreviated or not, with or without accents and with «de»', () => {
    const rows = strip(parse('Hepatitis A 14 mar 2024\nBCG 5 de septiembre de 2023\nNeumocócica 3-oct-23\nTriple viral 1 dic. 2024'))
    expect(rows.map((r) => [r.vaccine, r.appliedOn])).toEqual([
      ['hepatitis_a', '2024-03-14'],
      ['bcg', '2023-09-05'],
      ['pneumococcal', '2023-10-03'],
      ['mmr', '2024-12-01'],
    ])
  })

  it('matches names without case or accents, and a name written without its parenthesis', () => {
    expect(parse('NEUMOCOCICA 03/10/2023')[0].vaccine).toBe('pneumococcal')
    expect(parse('triple viral (srp) 03/10/2024')[0].vaccine).toBe('mmr')
  })

  it('does not take Hepatitis A for Hepatitis B or a word that merely contains a name', () => {
    expect(parse('Hepatitis A 14/03/2024')[0].vaccine).toBe('hepatitis_a')
    expect(parse('subcgx 14/03/2024')[0].vaccine).not.toBe('bcg')
  })

  it('reads the dose number in its usual spellings', () => {
    expect(parse('Hepatitis B dosis 2 14/03/2023')[0].doseNumber).toBe('2')
    expect(parse('Hepatitis B 2a dosis 14/03/2023')[0].doseNumber).toBe('2')
    expect(parse('Hepatitis B 3ª dosis 14/03/2023')[0].doseNumber).toBe('3')
    expect(parse('Hepatitis B refuerzo 14/03/2023')[0].doseNumber).toBe('')
    expect(parse('Hepatitis B dosis 99 14/03/2023')[0].doseNumber).toBe('')
  })

  it('proposes one row for each date of the line', () => {
    const rows = strip(parse('Hepatitis B 14/03/2023 20/05/2023'))
    expect(rows.map((r) => r.appliedOn)).toEqual(['2023-03-14', '2023-05-20'])
    expect(new Set(rows.map((r) => r.vaccine))).toEqual(new Set(['hepatitis_b']))
  })

  it('leaves the date empty when it is impossible, before birth or in the future, so the row is marked', () => {
    expect(parse('BCG 31/02/2023')[0].appliedOn).toBe('')
    expect(parse('BCG 05/01/2022')[0].appliedOn).toBe('')
    expect(parse('BCG 05/01/2027')[0].appliedOn).toBe('')
  })

  it('keeps a vaccine without a date as a row to complete', () => {
    expect(strip(parse('Neumocócica'))).toEqual([{ vaccine: 'pneumococcal', customName: '', appliedOn: '', doseNumber: '' }])
  })

  it('offers the words around a date as «otra» when the name is not in the catalog', () => {
    const [row] = parse('Rabia | 12/02/2024')
    expect(row.vaccine).toBe(OTHER)
    expect(row.customName).toBe('Rabia')
    expect(row.appliedOn).toBe('2024-02-12')
  })

  it('leaves the vaccine to choose when a line has a date and no usable words', () => {
    const [row] = parse('12/02/2024')
    expect(row.vaccine).toBe('')
    expect(row.customName).toBe('')
  })

  it('ignores the birth date line and gives each row its own key', () => {
    const rows = parse('Fecha de nacimiento 10/01/2023\nBCG 15/01/2023\nHepatitis B 15/01/2023')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })

  it('returns nothing for empty text, blank lines or noise', () => {
    expect(parse('')).toEqual([])
    expect(parse('\n  \n')).toEqual([])
    expect(parse('~~ ## 12 || .. 3 x')).toEqual([])
    expect(parse('1234567 / 89')).toEqual([])
  })

  it('never saves, calls or throws: it only returns rows (garbage in the middle of a line is harmless)', () => {
    expect(() => parse('Hepatitis B ??? 14/03/2023 \u0000 ***')).not.toThrow()
    expect(parse('Hepatitis B ??? 14/03/2023 ***')).toHaveLength(1)
  })

  it('uses the device day by default', () => {
    expect(parseVaccineText('BCG 15/01/2023', CATALOG, BIRTH)[0].appliedOn).toBe('2023-01-15')
  })

  it('ignores a month word that is not a month', () => {
    expect(parse('BCG 14 xyz 2023')[0].appliedOn).toBe('')
  })
})
