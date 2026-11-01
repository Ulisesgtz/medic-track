import { describe, expect, it } from 'vitest'
import { canGenerate, emptyPeriod, filtersSummary, fileSize, readyPeriod } from './panelModel'

const both = { consultations: true, vaccinations: true, photos: false }

describe('the panel’s words', () => {
  it('fileSize', () => {
    expect(fileSize(200)).toBe('1 KB')
    expect(fileSize(48 * 1024)).toBe('48 KB')
    expect(fileSize(1.2 * 1024 * 1024)).toBe('1.2 MB')
  })

  it('readyPeriod says the year once when both days share it', () => {
    expect(readyPeriod({ kind: 'range', from: '2026-01-01', to: '2026-10-24' })).toBe('del 1 ene al 24 oct 2026')
    expect(readyPeriod({ kind: 'range', from: '2025-12-01', to: '2026-01-24' })).toBe('del 1 dic 2025 al 24 ene 2026')
    expect(readyPeriod({ kind: 'all' })).toBe('todo el historial')
    expect(readyPeriod({ kind: 'filters', filters: {} })).toBe('con los filtros del historial')
  })

  it('emptyPeriod opens the sentence of the mock', () => {
    expect(emptyPeriod({ kind: 'range', from: '2026-09-01', to: '2026-09-30' })).toBe('Del 1 sep al 30 sep 2026')
    expect(emptyPeriod({ kind: 'all' })).toBe('En el historial')
    expect(emptyPeriod({ kind: 'filters', filters: {} })).toBe('Con los filtros del historial')
  })

  it('filtersSummary is the mock’s «Dra. Laura Cázares · Fiebre», or null with no filter', () => {
    expect(filtersSummary({ doctor: 'Dra. Laura Cázares', symptomCodes: ['fever'] }, { fever: 'Fiebre' })).toBe('Dra. Laura Cázares · Fiebre')
    expect(filtersSummary(null)).toBeNull()
    expect(filtersSummary({})).toBeNull()
    expect(filtersSummary({ kind: 'all' })).toBeNull()
    expect(filtersSummary({ q: ' tos ', from: '2026-01-01', to: '2026-03-01', medication: 'Paracetamol', symptomCodes: ['x'], kind: 'record' })).toBe(
      '«tos» · del 1 ene al 1 mar 2026 · Paracetamol · x · Solo registro',
    )
    expect(filtersSummary({ from: '2026-01-01', kind: 'treatment' })).toBe('Desde el 1 ene 2026 · Con tratamiento')
    expect(filtersSummary({ to: '2026-01-01' })).toBe('Hasta el 1 ene 2026')
  })

  it('canGenerate needs a section and a range in order', () => {
    expect(canGenerate({ kind: 'all' }, both)).toBe(true)
    expect(canGenerate({ kind: 'all' }, { ...both, consultations: false })).toBe(true)
    expect(canGenerate({ kind: 'all' }, { consultations: false, vaccinations: false, photos: true })).toBe(false)
    expect(canGenerate({ kind: 'range', from: '', to: '2026-01-01' }, both)).toBe(false)
    expect(canGenerate({ kind: 'range', from: '2026-02-01', to: '2026-01-01' }, both)).toBe(false)
    expect(canGenerate({ kind: 'range', from: '2026-01-01', to: '2026-01-01' }, both)).toBe(true)
    expect(canGenerate({ kind: 'filters', filters: {} }, both)).toBe(true)
  })
})
