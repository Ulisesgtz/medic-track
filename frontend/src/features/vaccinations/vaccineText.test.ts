import { describe, expect, it } from 'vitest'
import { TEXT, correctedLine, deleteRows, doseLine, entrySummary, groupLabel } from './vaccineText'

function every(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(every)
  return []
}

// Principio I: the card records what the parent captured and never says what is due, late or complete, gives advice or alarms.
const FORBIDDEN = /\btoca\b|\btocan\b|atras|completa|incompleta|alerta|urgente|recomend|debes|sem[aá]foro|\brojo\b|pendiente|falta|vencid/i

describe('the words of the vaccination card (Principio I)', () => {
  const sentences = [
    ...every(TEXT),
    doseLine({ doseNumber: 2, appliedOn: '2024-03-14', place: 'Centro de salud' }),
    correctedLine({ correctedAt: '2026-11-05T18:00:00Z', correctedByName: 'Ana' }),
    entrySummary(0, 0),
    entrySummary(1, 1),
    entrySummary(3, 2),
    groupLabel({ name: 'Hepatitis B', appliedOn: '2024-03-14' }),
    ...deleteRows({ name: 'Hepatitis B', appliedOn: '2024-03-14' }).flatMap((r) => [r.k, r.v]),
  ]

  it('never advises, evaluates, alarms or says what is due or missing', () => {
    for (const text of sentences) expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })

  it('always says that what is shown is what the parent captured (FR-017)', () => {
    expect(TEXT.note).toMatch(/lo que tú capturaste/)
    expect(TEXT.note).toMatch(/no sustituye la cartilla ni el criterio de tu médico/i)
  })

  it('every state has a way out: the empty card, the error, the delete confirmation', () => {
    expect(TEXT.empty.body).toMatch(/a mano/)
    expect(TEXT.empty.body).toMatch(/foto/)
    expect(TEXT.retry).toBeTruthy()
    expect(TEXT.confirmDelete.cancel).toBeTruthy()
    expect(TEXT.dialog.cancel).toBeTruthy()
  })

  it('the delete confirmation says nothing about undoing: the dose is deleted for good, so the title asks and the rows say so elsewhere', () => {
    expect(TEXT.confirmDelete.title).toMatch(/\?$/)
  })
})

describe('groupLabel and deleteRows', () => {
  it('say which dose a button acts on, and that deleting cannot be undone', () => {
    expect(groupLabel({ name: 'Hepatitis B', appliedOn: '2024-03-14' })).toBe('Hepatitis B del 14 mar 2024')
    const rows = deleteRows({ name: 'Hepatitis B', appliedOn: '2024-03-14' })
    expect(rows[0].v).toBe('La dosis de Hepatitis B del 14 mar 2024.')
    expect(rows[1].k).toBe('No se puede deshacer')
  })
})

describe('doseLine', () => {
  it('lists only what was recorded, in order', () => {
    expect(doseLine({ doseNumber: 2, appliedOn: '2024-03-14', place: 'Centro de salud' })).toBe('Dosis 2 · 14 mar 2024 · Centro de salud')
    expect(doseLine({ doseNumber: null, appliedOn: '2024-03-14', place: null })).toBe('14 mar 2024')
  })
})

describe('correctedLine', () => {
  it('is empty for a dose nobody corrected', () => {
    expect(correctedLine({ correctedAt: null, correctedByName: null })).toBe('')
  })

  it('says when and by whom, with the first name', () => {
    expect(correctedLine({ correctedAt: '2026-11-05T18:00:00', correctedByName: 'Ana' })).toBe('Corregida el 05 nov 2026 por Ana')
    expect(correctedLine({ correctedAt: '2026-11-05T18:00:00', correctedByName: null })).toBe('Corregida el 05 nov 2026')
  })
})

describe('entrySummary', () => {
  it('counts what is recorded, in singular and plural', () => {
    expect(entrySummary(0, 0)).toBe('Sin vacunas registradas')
    expect(entrySummary(1, 0)).toBe('1 dosis registrada')
    expect(entrySummary(3, 1)).toBe('3 dosis registradas · 1 foto')
    expect(entrySummary(0, 2)).toBe('0 dosis registradas · 2 fotos')
  })
})
