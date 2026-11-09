import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorFor, updateChild, ChildProfileApiError } from './api'
import { CHILD_PROFILE, conflictLine, correctedLine } from './childProfileText'
import { errorsFromServer, identityChanged, isDirty, measuresChanged, toBody, validate, valuesOf, type ChildValues } from './editChildForm'
import { stubApi } from '../medicineCabinet/cabinet.test-utils'

const child = { firstName: 'Mateo', lastName: 'Morales', birthDate: '2024-06-10', height: 85, weight: null }
const today = '2026-11-09'

describe('editChildForm', () => {
  it('starts from the child, and tells the identity apart from the measures', () => {
    const initial = valuesOf(child)
    expect(initial).toEqual({ firstName: 'Mateo', lastName: 'Morales', birthDate: '2024-06-10', height: '85', weight: '' })
    expect(isDirty(initial, initial)).toBe(false)
    expect(identityChanged(initial, { ...initial, firstName: ' Mateo ' })).toBe(false)
    expect(identityChanged(initial, { ...initial, lastName: 'Ruiz' })).toBe(true)
    expect(identityChanged(initial, { ...initial, birthDate: '2024-06-11' })).toBe(true)
    expect(measuresChanged(initial, { ...initial, height: '85,0' })).toBe(false)
    expect(measuresChanged(initial, { ...initial, weight: '12,5' })).toBe(true)
    expect(measuresChanged(initial, { ...initial, height: '' })).toBe(true)
    expect(isDirty(initial, { ...initial, weight: '12' })).toBe(true)
  })

  it('checks like the server', () => {
    const ok: ChildValues = { firstName: 'Sofía', lastName: "D'Amico-Ruiz", birthDate: '2024-06-10', height: '', weight: '12,4' }
    expect(validate(ok, today, false)).toEqual({})
    expect(validate({ firstName: ' ', lastName: 'Ruiz2', birthDate: '', height: '0', weight: 'x' }, today, false)).toEqual({
      firstName: CHILD_PROFILE.errors.firstName,
      lastName: CHILD_PROFILE.errors.lastName,
      birthDate: CHILD_PROFILE.errors.birthDate,
      height: CHILD_PROFILE.errors.height,
      weight: CHILD_PROFILE.errors.weight,
    })
    expect(validate({ ...ok, firstName: 'a'.repeat(101) }, today, false).firstName).toBeDefined()
    expect(validate({ ...ok, birthDate: '2026-11-10' }, today, false).birthDate).toBe(CHILD_PROFILE.errors.birthFuture)
  })

  it('the box asks the growth record’s ranges', () => {
    const v: ChildValues = { firstName: 'Mateo', lastName: 'Morales', birthDate: '2024-06-10', height: '88,5', weight: '12.4' }
    expect(validate(v, today, true)).toEqual({})
    expect(validate({ ...v, height: '', weight: '' }, today, true).measurement).toBe(CHILD_PROFILE.errors.measurementNone)
    expect(validate({ ...v, weight: '250' }, today, true).measurement).toBe(CHILD_PROFILE.errors.measurementWeight)
    expect(validate({ ...v, weight: '12.345' }, today, true).measurement).toBe(CHILD_PROFILE.errors.measurementWeight)
    expect(validate({ ...v, height: '20' }, today, true).measurement).toBe(CHILD_PROFILE.errors.measurementHeight)
    // Without the box, any positive weight.
    expect(validate({ ...v, weight: '250' }, today, false)).toEqual({})
  })

  it('the body: trimmed, decimals, null when empty, the measurement only with the box', () => {
    const v: ChildValues = { firstName: ' Sofía ', lastName: 'Gómez', birthDate: '2024-06-10', height: '', weight: '12,4' }
    expect(toBody(v, false, today)).toEqual({ firstName: 'Sofía', lastName: 'Gómez', birthDate: '2024-06-10', height: null, weight: 12.4, measurement: null })
    expect(toBody(v, true, today).measurement).toEqual({ measuredOn: today })
  })

  it('the server’s errors on the form’s fields', () => {
    expect(
      errorsFromServer([
        { field: 'firstName', message: 'a' },
        { field: 'measurement.weightKg', message: 'b' },
      ]),
    ).toEqual({ firstName: 'a', measurement: 'b' })
  })
})

describe('childProfileText', () => {
  it('the trace and the conflict, neutral', () => {
    expect(correctedLine('2026-11-09T16:20:00Z', 'Ana')).toMatch(/^Corregido el .*nov.* por Ana$/)
    expect(conflictLine({ measurementCount: 2, measurements: ['2022-03-03', '2022-04-14'], vaccinationCount: 1, vaccinations: ['2022-03-10'] })).toMatch(
      /^Hay 2 medidas \(.+, .+\) y 1 vacuna \(.+\) anotadas antes de esa fecha\. Corrígelas primero o elige otra fecha\.$/,
    )
    expect(conflictLine({ measurementCount: 1, measurements: ['2022-03-03'], vaccinationCount: 0, vaccinations: [] })).toMatch(/^Hay 1 medida \(.+\) anotada antes/)
    expect(conflictLine({ measurementCount: 22, measurements: Array(20).fill('2022-03-03'), vaccinationCount: 0, vaccinations: [] })).toContain(' y 2 más)')
  })

  it('never judges a child (Principio I)', () => {
    const all = JSON.stringify(CHILD_PROFILE).toLowerCase()
    for (const word of ['normal', 'bajo', 'alto', 'riesgo', 'sobrepeso', 'desnutri', 'debería', 'percentil', 'por debajo', 'por encima']) {
      expect(all).not.toContain(word)
    }
  })
})

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps every answer of the contract', () => {
    expect(errorFor(400, { error: 'validation_error', details: [{ field: 'firstName', message: 'x' }] }).details).toHaveLength(1)
    const conflict = errorFor(409, { error: 'birth_date_conflict', measurementCount: 1, measurements: ['2022-03-03'] })
    expect(conflict.kind).toBe('birth_date_conflict')
    expect(conflict.conflict).toEqual({ measurementCount: 1, measurements: ['2022-03-03'], vaccinationCount: 0, vaccinations: [] })
    expect(errorFor(422, { error: 'freemium_consultation_limit_exceeded', reason: 'child_identity' } as never).kind).toBe('plan_required')
    expect(errorFor(422, { error: 'growth_limit_exceeded' }).kind).toBe('limit')
    expect(errorFor(403, {}).kind).toBe('forbidden')
    expect(errorFor(404, {}).kind).toBe('not_found')
    expect(errorFor(500, {}).kind).toBe('unknown')
    expect(errorFor(409, { error: 'other' }).kind).toBe('unknown')
  })

  it('sends the whole child in the body and returns it', async () => {
    const mock = stubApi({ 'PUT /children/child-1': { body: { id: 'child-1', firstName: 'Sofía' } } })
    const body = { firstName: 'Sofía', lastName: 'Gómez', birthDate: '2024-06-10', height: null, weight: 12, measurement: null }
    await expect(updateChild('child-1', body, 'tok')).resolves.toMatchObject({ firstName: 'Sofía' })
    const [url, init] = mock.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('Sof')
    expect(JSON.parse(String(init.body))).toEqual(body)
    stubApi({ 'PUT /children/child-1': { status: 404, body: {} } })
    await expect(updateChild('child-1', body, null)).rejects.toBeInstanceOf(ChildProfileApiError)
  })
})
