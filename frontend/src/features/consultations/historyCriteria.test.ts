import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CRITERIA, activeCount, filterCount, isEmpty, rangeInverted, readStored, toRequest, writeStored, type HistoryCriteria } from './historyCriteria'

const some: HistoryCriteria = {
  q: '  amox ', from: '2026-01-01', to: '2026-06-30', doctor: 'Dra. López', medication: 'Paracetamol', symptomCodes: ['fever', 'cough'], kind: 'record',
}

afterEach(() => {
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('historyCriteria', () => {
  it('counts every criterion that is on, each symptom and each date apart', () => {
    expect(activeCount(EMPTY_CRITERIA)).toBe(0)
    expect(activeCount(some)).toBe(8)
    expect(activeCount({ ...EMPTY_CRITERIA, q: '   ' })).toBe(0)
    expect(filterCount(some)).toBe(7)
    expect(isEmpty(EMPTY_CRITERIA)).toBe(true)
    expect(isEmpty({ ...EMPTY_CRITERIA, kind: 'treatment' })).toBe(false)
  })

  it('builds the request with only what is given, the text trimmed', () => {
    expect(toRequest(EMPTY_CRITERIA)).toEqual({})
    expect(toRequest(some)).toEqual({
      q: 'amox', from: '2026-01-01', to: '2026-06-30', doctor: 'Dra. López', medication: 'Paracetamol', symptomCodes: ['fever', 'cough'], kind: 'record',
    })
    expect(toRequest({ ...EMPTY_CRITERIA, q: '  ', kind: 'all' })).toEqual({})
  })

  it('knows a range turned around, and the same day or one end alone are not', () => {
    expect(rangeInverted({ ...EMPTY_CRITERIA, from: '2026-07-01', to: '2026-06-01' })).toBe(true)
    expect(rangeInverted({ ...EMPTY_CRITERIA, from: '2026-06-01', to: '2026-06-01' })).toBe(false)
    expect(rangeInverted({ ...EMPTY_CRITERIA, from: '2026-06-01' })).toBe(false)
    expect(rangeInverted({ ...EMPTY_CRITERIA, to: '2026-06-01' })).toBe(false)
  })

  it('keeps the criteria per child for the life of the tab and gives them back', () => {
    writeStored('child-1', some)
    writeStored('child-2', { ...EMPTY_CRITERIA, q: 'otro' })

    expect(readStored('child-1')).toEqual(some)
    expect(readStored('child-2').q).toBe('otro')
    expect(readStored('child-3')).toEqual(EMPTY_CRITERIA)
    expect(window.sessionStorage.getItem('historial:child-1')).not.toBeNull()
  })

  it('keeps nothing when no criterion is on (and forgets what was kept)', () => {
    writeStored('child-1', some)
    writeStored('child-1', EMPTY_CRITERIA)

    expect(window.sessionStorage.getItem('historial:child-1')).toBeNull()
  })

  it('drops what is broken or of the wrong type when reading', () => {
    window.sessionStorage.setItem('historial:a', '{not json')
    expect(readStored('a')).toEqual(EMPTY_CRITERIA)

    window.sessionStorage.setItem('historial:b', 'null')
    expect(readStored('b')).toEqual(EMPTY_CRITERIA)

    window.sessionStorage.setItem('historial:c', JSON.stringify({ q: 5, from: null, symptomCodes: 'fever', kind: 'everything', doctor: 'Dra. López' }))
    expect(readStored('c')).toEqual({ ...EMPTY_CRITERIA, doctor: 'Dra. López' })

    window.sessionStorage.setItem('historial:d', JSON.stringify({ symptomCodes: ['fever', 3, null, 'cough'], kind: 'treatment' }))
    expect(readStored('d')).toEqual({ ...EMPTY_CRITERIA, symptomCodes: ['fever', 'cough'], kind: 'treatment' })
  })

  it('does not throw when the storage is blocked: the screen just does not remember', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readStored('child-1')).toEqual(EMPTY_CRITERIA)
    expect(() => writeStored('child-1', some)).not.toThrow()
    expect(() => writeStored('child-1', EMPTY_CRITERIA)).not.toThrow()
  })
})
