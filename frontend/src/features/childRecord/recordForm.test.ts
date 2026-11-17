import { describe, expect, it } from 'vitest'
import { EMPTY_VALUES, errorsFromServer, isDirty, toInput, validate, valuesOf } from './recordForm'
import { emptyRecord, fullRecord } from './recordFixtures'

describe('recordForm', () => {
  it('turns a record into values and back, as written and in order', () => {
    const values = valuesOf(fullRecord)
    expect(values.allergies.map((a) => a.name)).toEqual(['Penicilina', 'Cacahuate', 'Polen'])
    expect(values.allergies[2].kind).toBe('')
    expect(valuesOf(emptyRecord)).toEqual(EMPTY_VALUES)
    const input = toInput(values, 3)
    expect(input).toMatchObject({ expectedVersion: 3, bloodType: 'O+', generalNote: 'Usa lentes desde los 4 años.' })
    expect(input.allergies[2]).toEqual({ name: 'Polen', kind: null, note: null })
    expect(input.pediatrician).toEqual({ name: 'Dra. Ruiz', phone: '+52 33 1234 5678', office: 'Torre Médica, piso 4' })
  })

  it('drops empty entries and an empty pediatrician, trims, and sends nulls', () => {
    const input = toInput(
      { ...EMPTY_VALUES, allergies: [{ name: '  ', kind: '', note: '' }, { name: ' Nuez ', kind: 'food', note: ' ' }], conditions: [{ name: '', note: '' }], pedPhone: ' ', generalNote: ' ' },
      0,
    )
    expect(input).toEqual({ expectedVersion: 0, bloodType: null, generalNote: null, pediatrician: null, allergies: [{ name: 'Nuez', kind: 'food', note: null }], conditions: [] })
    expect(toInput({ ...EMPTY_VALUES, pedName: 'Dra.' }, 1).pediatrician).toEqual({ name: 'Dra.', phone: null, office: null })
  })

  it('validates names, lengths and the phone, naming the field', () => {
    expect(validate(valuesOf(fullRecord))).toEqual({})
    const bad = validate({
      ...EMPTY_VALUES,
      allergies: [{ name: '', kind: 'food', note: '' }, { name: 'x'.repeat(121), kind: '', note: 'y'.repeat(301) }, { name: '', kind: '', note: '' }],
      conditions: [{ name: '', note: 'solo nota' }, { name: 'c'.repeat(121), note: 'n'.repeat(301) }],
      pedName: 'p'.repeat(121),
      pedOffice: 'o'.repeat(301),
      pedPhone: 'llamar',
      generalNote: 'g'.repeat(1001),
    })
    expect(Object.keys(bad).sort()).toEqual(
      ['allergies.0.name', 'allergies.1.name', 'allergies.1.note', 'conditions.0.name', 'conditions.1.name', 'conditions.1.note', 'generalNote', 'pedName', 'pedOffice', 'pedPhone'].sort(),
    )
    expect(bad['allergies.1.name']).toBe('Máximo 120 caracteres. Revisa este campo.')
    expect(validate({ ...EMPTY_VALUES, pedPhone: '1'.repeat(31) }).pedPhone).toContain('Máximo 30')
  })

  it('maps the server field paths and detects changes', () => {
    expect(
      errorsFromServer([
        { field: 'allergies[2].name', message: 'x' },
        { field: 'pediatrician.phone', message: 'y' },
        { field: 'pediatrician.name', message: 'y' },
        { field: 'pediatrician.office', message: 'y' },
      ]),
    ).toEqual({
      'allergies.2.name': 'Revisa este campo.',
      pedPhone: 'Revisa este campo.',
      pedName: 'Revisa este campo.',
      pedOffice: 'Revisa este campo.',
    })
    const a = valuesOf(fullRecord)
    expect(isDirty(a, valuesOf(fullRecord))).toBe(false)
    expect(isDirty(a, { ...a, bloodType: 'A+' })).toBe(true)
  })
})
