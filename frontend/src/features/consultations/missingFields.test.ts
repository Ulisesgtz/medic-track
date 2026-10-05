import { describe, it, expect } from 'vitest'
import type { FieldErrors } from 'react-hook-form'
import type { ConsultationFormValues } from './ConsultationForm'
import { missingFieldsText } from './missingFields'

const err = { type: 'required', message: '' }

describe('missingFieldsText', () => {
  it('names only what is missing, in the form order', () => {
    const errors = { medications: [{ name: err, startTime: err }] } as unknown as FieldErrors<ConsultationFormValues>
    expect(missingFieldsText(errors, true, 1)).toBe('Falta: la foto de la receta, el nombre del medicamento, la hora de la primera toma.')
  })

  it('everything, when nothing was filled', () => {
    const errors = {
      doctorName: err,
      consultDate: err,
      medications: [{ name: err, frequencyHours: err, durationDays: err, startTime: err }],
    } as unknown as FieldErrors<ConsultationFormValues>
    expect(missingFieldsText(errors, true, 1)).toBe(
      'Falta: la foto de la receta, el doctor, la fecha, el nombre del medicamento, cada cuántas horas, cuántos días, la hora de la primera toma.',
    )
  })

  it('with several medications, says which one', () => {
    const errors = { medications: [undefined, { durationDays: err }] } as unknown as FieldErrors<ConsultationFormValues>
    expect(missingFieldsText(errors, false, 2)).toBe('Falta: cuántos días (medicamento 2).')
  })

  it('falls back to the generic text if nothing specific is known', () => {
    expect(missingFieldsText({}, false, 1)).toBe('Completa los campos faltantes.')
  })
})

describe('missingFieldsText, record only (specs/024)', () => {
  it('does not ask for the start time of a consultation with no schedule', () => {
    const errors = { medications: [{ name: err, startTime: err }] } as unknown as FieldErrors<ConsultationFormValues>

    expect(missingFieldsText(errors, false, 1, true)).toBe('Falta: el nombre del medicamento.')
  })

  it('still says something when only the start time failed', () => {
    const errors = { medications: [{ startTime: err }] } as unknown as FieldErrors<ConsultationFormValues>

    expect(missingFieldsText(errors, false, 1, true)).toBe('Completa los campos faltantes.')
  })
})
