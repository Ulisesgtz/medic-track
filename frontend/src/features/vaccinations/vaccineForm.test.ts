import { describe, expect, it } from 'vitest'
import { OTHER, emptyValues, isDirty, localToday, serverErrors, toInput, validateDose, valuesOf } from './vaccineForm'
import { TEXT } from './vaccineText'
import type { Vaccination } from './types'

const TODAY = '2026-10-17'
const BIRTH = '2021-03-14'
const ok = { ...emptyValues(), vaccine: 'bcg', appliedOn: '2024-05-01' }

describe('validateDose', () => {
  it('is empty for a catalog vaccine and a valid date', () => {
    expect(validateDose(ok, BIRTH, TODAY)).toEqual({})
  })

  it('asks for a vaccine, or a name when «Otra…» is chosen', () => {
    expect(validateDose({ ...ok, vaccine: '' }, BIRTH, TODAY).vaccine).toBe(TEXT.errors.vaccine)
    expect(validateDose({ ...ok, vaccine: OTHER, customName: '   ' }, BIRTH, TODAY).vaccine).toBe(TEXT.errors.vaccine)
    expect(validateDose({ ...ok, vaccine: OTHER, customName: 'Mi vacuna' }, BIRTH, TODAY)).toEqual({})
    expect(validateDose({ ...ok, vaccine: OTHER, customName: 'ñ'.repeat(100) }, BIRTH, TODAY)).toEqual({})
    expect(validateDose({ ...ok, vaccine: OTHER, customName: 'a'.repeat(101) }, BIRTH, TODAY).customName).toBe(TEXT.errors.customName)
  })

  it('wants a date that is not in the future nor before the birth (both ends are valid)', () => {
    expect(validateDose({ ...ok, appliedOn: '' }, BIRTH, TODAY).appliedOn).toBe(TEXT.errors.appliedOn)
    expect(validateDose({ ...ok, appliedOn: '14/03/2021' }, BIRTH, TODAY).appliedOn).toBe(TEXT.errors.appliedOn)
    expect(validateDose({ ...ok, appliedOn: '2026-10-18' }, BIRTH, TODAY).appliedOn).toBe(TEXT.errors.future)
    expect(validateDose({ ...ok, appliedOn: '2021-03-13' }, BIRTH, TODAY).appliedOn).toBe(TEXT.errors.beforeBirth)
    expect(validateDose({ ...ok, appliedOn: TODAY }, BIRTH, TODAY)).toEqual({})
    expect(validateDose({ ...ok, appliedOn: BIRTH }, BIRTH, TODAY)).toEqual({})
    expect(validateDose({ ...ok, appliedOn: '2021-03-14' }, '2021-03-14T00:00:00Z', TODAY)).toEqual({})
  })

  it('the dose is a whole number from 1 to 20, and the optional texts have their limits', () => {
    for (const bad of ['0', '21', '1.5', 'x', '-1']) expect(validateDose({ ...ok, doseNumber: bad }, BIRTH, TODAY).doseNumber, bad).toBe(TEXT.errors.dose)
    for (const good of ['', ' ', '1', '20']) expect(validateDose({ ...ok, doseNumber: good }, BIRTH, TODAY).doseNumber, good).toBeUndefined()
    const errors = validateDose({ ...ok, lot: 'l'.repeat(61), place: 'p'.repeat(121), notes: 'n'.repeat(501) }, BIRTH, TODAY)
    expect(Object.keys(errors).sort()).toEqual(['lot', 'notes', 'place'])
    expect(validateDose({ ...ok, lot: 'l'.repeat(60), place: 'p'.repeat(120), notes: 'n'.repeat(500) }, BIRTH, TODAY)).toEqual({})
  })
})

describe('toInput', () => {
  it('sends the catalog code and no own name, trimmed, with the dose as a number', () => {
    expect(toInput({ ...ok, doseNumber: ' 2 ', lot: ' L1 ', place: ' Centro ', notes: ' Nota ' })).toEqual({
      vaccineCode: 'bcg', customName: '', appliedOn: '2024-05-01', doseNumber: 2, lot: 'L1', place: 'Centro', notes: 'Nota',
    })
  })

  it('«Otra…» sends the parent\'s own name and no code; allowDuplicate only when confirmed', () => {
    const input = toInput({ ...ok, vaccine: OTHER, customName: '  Mi vacuna ' })
    expect(input.vaccineCode).toBe('')
    expect(input.customName).toBe('Mi vacuna')
    expect(input.doseNumber).toBeNull()
    expect(input).not.toHaveProperty('allowDuplicate')
    expect(toInput(ok, true).allowDuplicate).toBe(true)
  })
})

describe('valuesOf and isDirty', () => {
  const dose: Vaccination = {
    id: 'd1', vaccineCode: null, name: 'Mi vacuna', customName: 'Mi vacuna', appliedOn: '2024-05-01', doseNumber: 2, lot: 'L1', place: null, notes: null,
    createdByName: 'Ana', createdAt: '2026-10-01T10:00:00Z', correctedByName: null, correctedAt: null,
  }

  it('a recorded dose with its own name loads as «Otra…» with the name, and a catalog one as its code', () => {
    expect(valuesOf(dose)).toEqual({ vaccine: OTHER, customName: 'Mi vacuna', appliedOn: '2024-05-01', doseNumber: '2', lot: 'L1', place: '', notes: '' })
    expect(valuesOf({ ...dose, vaccineCode: 'bcg', customName: null, doseNumber: null }).vaccine).toBe('bcg')
    expect(valuesOf({ ...dose, vaccineCode: 'bcg', customName: null, doseNumber: null }).doseNumber).toBe('')
  })

  it('knows when something was typed', () => {
    expect(isDirty(emptyValues(), emptyValues())).toBe(false)
    expect(isDirty({ ...emptyValues(), notes: 'x' }, emptyValues())).toBe(true)
    expect(isDirty(valuesOf(dose), valuesOf(dose))).toBe(false)
  })
})

describe('serverErrors', () => {
  it('keeps the fields of the form and drops the rest', () => {
    expect(serverErrors([{ field: 'appliedOn', message: 'm' }, { field: 'unknown', message: 'x' }])).toEqual({ appliedOn: 'm' })
    expect(serverErrors(undefined)).toEqual({})
  })
})

describe('localToday', () => {
  it('is the device\'s own calendar day', () => {
    expect(localToday(new Date(2026, 9, 7, 23, 30))).toBe('2026-10-07')
  })
})
