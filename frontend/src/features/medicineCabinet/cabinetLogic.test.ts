import { describe, expect, it, vi, afterEach } from 'vitest'
import { cabinetAccess } from './cabinetAccess'
import { EMPTY_VALUES, applyProposal, isDirty, toInput, validate, valuesOf, yearOptions } from './cabinetForm'
import {
  CABINET,
  addedBy,
  editedBy,
  entryCount,
  expiresDate,
  expiresLine,
  fromConsultation,
  listCount,
  noResults,
  quantityText,
  shortcutName,
  unitLabel,
} from './cabinetText'
import { CabinetApiError, createCabinetItem, deleteCabinetItem, fetchCabinet, fetchCabinetItem, fetchCabinetPhoto, updateCabinetItem } from './api'
import { account, item, stubApi } from './cabinet.test-utils'
import type { Account } from '../home/types'

const asAccount = (a: unknown) => a as Account

describe('cabinetText (Principio I)', () => {
  const every: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') every.push(v)
    else if (typeof v === 'function') every.push(String((v as (s: string) => string)('Zinc')))
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(CABINET)
  every.push(
    expiresLine({ year: 2020, month: 1, day: 1 }),
    entryCount(1),
    entryCount(7),
    listCount(2, 7, true),
    listCount(1, 1, false),
    noResults('x'),
    quantityText(1, 'box'),
    quantityText(20, 'tablet'),
    shortcutName('Amoxicilina'),
  )

  it('never says a medicine expired, can or can’t be used, nor advises', () => {
    for (const s of every) expect(s).not.toMatch(/caducad|vencid|se puede usar|no usar|tirar|urgente|alerta|debes|deber[ií]as|recomend|peligr/i)
  })

  it('writes the date only as typed, with the quantity’s words', () => {
    expect(expiresDate({ year: 2027, month: 3, day: null })).toBe('mar 2027')
    expect(expiresLine({ year: 2027, month: 3, day: 12 })).toBe('Caduca: 12 mar 2027')
    expect(quantityText(2, 'bottle')).toBe('2 frascos')
    expect(quantityText(1, 'bottle')).toBe('1 frasco')
    expect(quantityText(100, 'ml')).toBe('100 ml')
    expect(unitLabel('tablet')).toBe('tabletas')
    expect(listCount(7, 7, false)).toBe('7 medicamentos')
    expect(listCount(2, 7, true)).toBe('2 de 7 medicamentos')
    expect(entryCount(7)).toBe('7 medicamentos en el botiquín')
    expect(noResults('xyz')).toBe('Ningún medicamento del botiquín se llama «xyz».')
    expect(addedBy('Ana', new Date(2026, 10, 6, 12).toISOString())).toBe('Agregado por Ana · 6 nov')
    expect(editedBy('Luis', new Date(2026, 10, 7, 12).toISOString())).toBe('Editado por Luis · 7 nov')
    expect(fromConsultation('2026-10-18', 'Dra. Laura Cázares')).toEqual({
      lead: 'Desde la consulta del 18 oct',
      rest: ' · Dra. Laura Cázares. El nombre viene de la receta; puedes cambiarlo.',
    })
    expect(CABINET.removeTitle('Zinc')).toBe('¿Quitar Zinc?')
  })
})

describe('cabinetAccess', () => {
  it('the owner sees and edits; adds only with the paid plan', () => {
    expect(cabinetAccess(undefined)).toEqual({ ownerId: undefined, canView: false, canEdit: false, canAdd: false, isFree: false })
    expect(cabinetAccess(asAccount(account()))).toEqual({ ownerId: 'a1', canView: true, canEdit: true, canAdd: true, isFree: false })
    expect(cabinetAccess(asAccount(account({ plan: 'free' })))).toMatchObject({ canEdit: true, canAdd: false, isFree: true })
  })

  it('a member works with the family owner’s cabinet and plan', () => {
    const fam = (role: string, plan = 'paid') => asAccount(account({ plan: 'free', family: { role, ownerAccountId: 'owner', ownerName: 'Ana', plan, readOnly: plan !== 'paid' } }))
    expect(cabinetAccess(fam('tutor'))).toEqual({ ownerId: 'owner', canView: true, canEdit: true, canAdd: true, isFree: false })
    expect(cabinetAccess(fam('tutor', 'free'))).toMatchObject({ canView: true, canEdit: false, canAdd: false, isFree: true })
    expect(cabinetAccess(fam('caregiver'))).toMatchObject({ canView: true, canEdit: false, canAdd: false })
    expect(cabinetAccess(fam('child'))).toMatchObject({ canView: false })
  })
})

describe('cabinetForm', () => {
  const full = { ...EMPTY_VALUES, name: ' Zinc ', quantity: '2', unit: 'box' as const, month: '3', year: '2027' }

  it('checks what the server checks', () => {
    expect(validate(full)).toEqual({})
    expect(validate(EMPTY_VALUES)).toEqual({
      name: CABINET.required.name,
      quantity: CABINET.required.quantity,
      unit: CABINET.required.unit,
      expires: CABINET.required.expires,
    })
    expect(validate({ ...full, quantity: '1000' }).quantity).toBeDefined()
    expect(validate({ ...full, month: '2', day: '30' }).expires).toBe(CABINET.required.day)
    expect(validate({ ...full, day: '12' })).toEqual({})
  })

  it('builds the input and reads a saved medicine back', () => {
    expect(toInput({ ...full, strength: ' 500 mg ', note: ' cajón ' })).toEqual({
      name: 'Zinc',
      strength: '500 mg',
      quantity: 2,
      unit: 'box',
      expires: { year: 2027, month: 3, day: null },
      note: 'cajón',
    })
    expect(toInput({ ...full, day: '12' }).expires.day).toBe(12)
    expect(valuesOf(item({ expires: { year: 2027, month: 3, day: 12 } }))).toMatchObject({ name: 'Paracetamol infantil', quantity: '2', unit: 'bottle', day: '12' })
    expect(valuesOf(item()).day).toBe('')
    expect(isDirty(full, full)).toBe(false)
    expect(isDirty({ ...full, note: 'x' }, full)).toBe(true)
  })

  it('the reading only fills what is empty, never the quantity', () => {
    const proposal = { name: 'Amoxicilina', strength: '250 mg/5 ml', expires: { year: 2027, month: 2, day: 1 } }
    expect(applyProposal(EMPTY_VALUES, proposal)).toEqual({
      values: { ...EMPTY_VALUES, name: 'Amoxicilina', strength: '250 mg/5 ml', month: '2', year: '2027', day: '1' },
      proposed: ['name', 'strength', 'expires'],
    })
    const written = applyProposal({ ...EMPTY_VALUES, name: 'Mío', month: '5' }, { ...proposal, expires: { year: 2027, month: 2, day: null } })
    expect(written.values.name).toBe('Mío')
    expect(written.values.month).toBe('5')
    expect(written.proposed).toEqual(['strength'])
    expect(applyProposal(EMPTY_VALUES, {}).proposed).toEqual([])
  })

  it('offers three years back and ten ahead, plus the saved one', () => {
    const years = yearOptions(new Date(2026, 0, 1))
    expect(years[0]).toBe(2023)
    expect(years.at(-1)).toBe(2036)
    expect(yearOptions(new Date(2026, 0, 1), '2050').at(-1)).toBe(2050)
    expect(yearOptions(new Date(2026, 0, 1), '2027')).toHaveLength(14)
  })
})

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls the six routes under the owner’s account', async () => {
    const mock = stubApi({
      'GET /accounts/o1/medicine-cabinet': { body: { items: [], canAdd: true, canEdit: true, limit: 200 } },
      'POST /accounts/o1/medicine-cabinet': { status: 201, body: item() },
      'GET /accounts/o1/medicine-cabinet/m1': { body: item() },
      'PUT /accounts/o1/medicine-cabinet/m1': { body: item() },
      'DELETE /accounts/o1/medicine-cabinet/m1': { status: 204 },
      'GET /accounts/o1/medicine-cabinet/m1/photo': { body: { photoBase64: 'AA' } },
    })
    const input = { name: 'x', strength: '', quantity: 1, unit: 'ml' as const, expires: { year: 2027, month: 1, day: null }, note: '' }
    await fetchCabinet('o1', 't')
    await createCabinetItem('o1', input, 't')
    await fetchCabinetItem('o1', 'm1', 't')
    await updateCabinetItem('o1', 'm1', input, 't')
    await deleteCabinetItem('o1', 'm1', 't')
    expect(await fetchCabinetPhoto('o1', 'm1', 't')).toEqual({ photoBase64: 'AA' })
    expect(mock).toHaveBeenCalledTimes(6)
  })

  it('names each refusal', async () => {
    const kinds: [number, unknown, string][] = [
      [403, {}, 'forbidden'],
      [404, {}, 'not_found'],
      [400, { error: 'validation_error', details: [{ field: 'name', message: 'm' }] }, 'validation_error'],
      [422, { error: 'freemium_consultation_limit_exceeded', reason: 'medicine_cabinet' }, 'plan_required'],
      [422, { error: 'cabinet_limit_exceeded' }, 'limit'],
      [500, {}, 'unknown'],
    ]
    for (const [status, body, kind] of kinds) {
      stubApi({ 'GET /accounts/o1/medicine-cabinet': { status, body } })
      const err = await fetchCabinet('o1', null).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(CabinetApiError)
      expect((err as CabinetApiError).kind).toBe(kind)
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => Promise.reject(new Error('no json')) }))
    expect(((await fetchCabinet('o1', null).catch((e: unknown) => e)) as CabinetApiError).kind).toBe('unknown')
  })
})
